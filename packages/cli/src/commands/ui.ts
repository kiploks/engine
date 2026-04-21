import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import type { ViteDevServer } from "vite";
import { analyze, mapPayloadToUnified } from "@kiploks/engine-core";
import { buildTestResultDataFromUnified } from "@kiploks/engine-core/server";

type IntegrationKind = "freqtrade" | "octobot";
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type JobType = "csv_analyze" | "integration_bootstrap" | "integration_run";

type UiCommandArgs = {
  port?: number;
  open?: boolean;
  /** When true, start Vite dev server with HMR and proxy API routes to this orchestrator. */
  watch?: boolean;
};

type PreflightResult = {
  checkedAt: string;
  python: { ok: boolean; commandTried: string[] };
  docker: { ok: boolean; commandTried: string[] };
  node: { ok: boolean; version: string };
};

type SavedPath = {
  integration: IntegrationKind;
  displayPath: string;
  canonicalPath: string;
  updatedAt: string;
};

type JobRecord = {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  logs: string[];
  result?: unknown;
  error?: string;
};

type LocalReport = {
  id: string;
  createdAt: string;
  source: string;
  reportName: string | null;
  symbol: string | null;
  strategy: string | null;
  /** demo = seeded SaaS-shaped fixture; integration = POST /api/integration/results */
  reportKind: "demo" | "integration";
  /** When this row came from one POST with multiple `results` (e.g. top_n), 0-based index and total. */
  batchIndex: number | null;
  batchTotal: number | null;
  /** Kiploks (or compatible) full analyze page after cloud upload. */
  kiploksAnalyzeUrl: string | null;
  /** This orchestrator UI deep link (/ui/#report=). */
  orchestratorShellUrl: string | null;
  report: unknown;
  rawPayload: unknown;
};

type AnalyzeLinkRecord = {
  url: string;
  createdAt: string;
  source: "integration_result_payload" | "integration_run_logs";
  integration?: IntegrationKind;
  jobId?: string;
  reportId?: string;
};

const state = {
  lastPreflight: null as PreflightResult | null,
  paths: new Map<IntegrationKind, SavedPath>(),
  jobs: [] as JobRecord[],
  streams: new Map<string, Set<ServerResponse<IncomingMessage>>>(),
  /** URL for the browser / human (loopback). */
  localApiBaseUrl: "http://127.0.0.1:41731",
  /** Base URL written to kiploks.json for integrations that run inside Docker (must reach the host). */
  localApiDockerBaseUrl: "http://host.docker.internal:41731",
  localApiToken: `local_${Math.random().toString(36).slice(2)}_${Date.now()}_kiploks_token`,
  reports: [] as LocalReport[],
  cloudAnalyzeLinks: [] as AnalyzeLinkRecord[],
  integrationRunProcesses: new Map<string, ChildProcess>(),
};

/**
 * Seed in-memory reports from JSON fixtures aligned with Kiploks SaaS demo data
 * (`private-core-saas/frontend/src/data/mockTestResult.ts` and `mockPaperTiger`).
 */
function seedDemoReportsFromKiploksSaaSFixtures(cliRoot: string): number {
  if (process.env.KIPLOKS_UI_SEED_SAAS_DEMOS !== "1") {
    return 0;
  }
  if (state.reports.length > 0) return 0;
  const specs: Array<{ file: string; id: string; source: string }> = [
    {
      file: "saas-mock-report.json",
      id: "demo_saas_robust",
      source: "kiploks-saas-demo (mockTestResult fixture)",
    },
    {
      file: "saas-mock-paper-tiger-report.json",
      id: "demo_saas_paper_tiger",
      source: "kiploks-saas-demo (mockPaperTiger fixture)",
    },
  ];
  const seeded: LocalReport[] = [];
  for (const spec of specs) {
    const p = join(cliRoot, "fixtures", spec.file);
    if (!existsSync(p)) continue;
    try {
      const report = JSON.parse(readFileSync(p, "utf8")) as unknown;
      const strat =
        report != null && typeof report === "object" && !Array.isArray(report)
          ? (report as Record<string, unknown>).strategy
          : null;
      const s =
        strat != null && typeof strat === "object" && !Array.isArray(strat)
          ? (strat as Record<string, unknown>)
          : {};
      seeded.push({
        id: spec.id,
        createdAt: new Date().toISOString(),
        source: spec.source,
        reportName: null,
        symbol: typeof s.symbol === "string" ? s.symbol : null,
        strategy: typeof s.name === "string" ? s.name : null,
        reportKind: "demo",
        batchIndex: null,
        batchTotal: null,
        kiploksAnalyzeUrl: null,
        orchestratorShellUrl: null,
        report,
        rawPayload: { fixture: spec.file, origin: "private-core-saas frontend demo exports" },
      });
    } catch {
      /* ignore invalid fixture */
    }
  }
  for (let i = seeded.length - 1; i >= 0; i--) {
    state.reports.unshift(seeded[i]!);
  }
  return seeded.length;
}

const EXTERNAL_ANALYZE_PAGE_RE =
  /^https:\/\/(?:(?:[a-zA-Z0-9-]+\.)*kiploks\.com|localhost:3300|127\.0\.0\.1:3300|host\.docker\.internal:3300)\/analyze\/[a-zA-Z0-9_-]+\/?(?:[?#].*)?$/i;

function asTrimmedString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

function asRecordLike(v: unknown): Record<string, unknown> | null {
  if (v != null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/**
 * Kiploks Cloud analyze URL for this result: from POST body (kiploksAnalyzeUrl(s) / analyzeUrls to kiploks.com),
 * or from raw payload fields used by integration exports.
 */
function pickKiploksAnalyzeUrlForResult(
  body: { kiploksAnalyzeUrl?: unknown; kiploksAnalyzeUrls?: unknown; analyzeUrls?: unknown } | null | undefined,
  resultIndex: number,
  raw: Record<string, unknown>,
): string | null {
  const tryUrl = (u: string): string | null => {
    const t = u.trim();
    if (!t) return null;
    if (EXTERNAL_ANALYZE_PAGE_RE.test(t)) return t;
    return null;
  };

  const fromRaw =
    asTrimmedString(raw.kiploksAnalyzeUrl) ||
    asTrimmedString((raw as { _kiploksAnalyzeUrl?: unknown })._kiploksAnalyzeUrl) ||
    asTrimmedString(asRecordLike((raw as { kiploks?: unknown }).kiploks)?.analyzeUrl) ||
    asTrimmedString((raw as { kiploksCloud?: { analyzeUrl?: unknown } }).kiploksCloud?.analyzeUrl);
  if (fromRaw) {
    const ok = tryUrl(fromRaw);
    if (ok) return ok;
  }
  const rawArr = (raw as { kiploksAnalyzeUrls?: unknown }).kiploksAnalyzeUrls;
  if (Array.isArray(rawArr) && resultIndex < rawArr.length) {
    const ok = tryUrl(String(rawArr[resultIndex] ?? ""));
    if (ok) return ok;
  }

  if (body) {
    const fromUrls = body.kiploksAnalyzeUrls;
    if (Array.isArray(fromUrls) && fromUrls[resultIndex] != null) {
      const ok = tryUrl(String(fromUrls[resultIndex]));
      if (ok) return ok;
    }
    const single = asTrimmedString(body.kiploksAnalyzeUrl);
    if (single) {
      const ok = tryUrl(single);
      if (ok) return ok;
    }
    const analyzeUrls = body.analyzeUrls;
    if (Array.isArray(analyzeUrls) && analyzeUrls[resultIndex] != null) {
      const ok = tryUrl(String(analyzeUrls[resultIndex] ?? analyzeUrls[0] ?? ""));
      if (ok) return ok;
    }
  }
  return null;
}

function pickOrchestratorShellUrlForResult(raw: Record<string, unknown>, canonicalShellUrl: string): string {
  const u = asTrimmedString(raw.orchestratorShellUrl);
  if (u && u.includes("#report=")) return u;
  return canonicalShellUrl;
}

function verdictFromReportData(report: unknown): string | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const ds = (report as Record<string, unknown>).decisionSummary;
  if (!ds || typeof ds !== "object" || Array.isArray(ds)) return null;
  const v = (ds as Record<string, unknown>).verdict;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function buildReportListRow(r: LocalReport): Record<string, unknown> {
  const verdict = verdictFromReportData(r.report);
  const kind = r.reportKind;
  let listLabel = r.reportName || r.strategy || r.symbol || r.id;
  if (!r.reportName) {
    const analyzedAt = formatListLabelDateTime(r.createdAt);
    if (analyzedAt) listLabel += ` (${analyzedAt})`;
  }
  if (kind === "demo") {
    listLabel = `[Demo fixture] ${listLabel}`;
  } else if (r.batchTotal != null && r.batchTotal > 1 && r.batchIndex != null) {
    listLabel += ` (rank ${r.batchIndex + 1}/${r.batchTotal})`;
  }
  if (verdict) {
    listLabel += ` - ${verdict}`;
  }
  return {
    id: r.id,
    createdAt: r.createdAt,
    source: r.source,
    reportName: r.reportName,
    symbol: r.symbol,
    strategy: r.strategy,
    reportKind: r.reportKind,
    batchIndex: r.batchIndex,
    batchTotal: r.batchTotal,
    verdict,
    listLabel,
    kiploksAnalyzeUrl: r.kiploksAnalyzeUrl,
    orchestratorShellUrl: r.orchestratorShellUrl,
  };
}

function formatListLabelDateTime(input: string): string | null {
  const dt = new Date(input);
  if (!Number.isFinite(dt.getTime())) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function pushCloudAnalyzeLink(
  url: string,
  meta: Omit<AnalyzeLinkRecord, "url" | "createdAt">,
): void {
  const clean = String(url || "").trim();
  if (!EXTERNAL_ANALYZE_PAGE_RE.test(clean)) return;
  const existing = state.cloudAnalyzeLinks.find((x) => x.url === clean);
  if (existing) {
    if (!existing.reportId && meta.reportId) existing.reportId = meta.reportId;
    if (!existing.jobId && meta.jobId) existing.jobId = meta.jobId;
    if (!existing.integration && meta.integration) existing.integration = meta.integration;
    return;
  }
  state.cloudAnalyzeLinks.unshift({
    url: clean,
    createdAt: new Date().toISOString(),
    source: meta.source,
    integration: meta.integration,
    jobId: meta.jobId,
    reportId: meta.reportId,
  });
}

function backfillAnalyzeUrlsIntoRecentReports(
  integration: IntegrationKind,
  urls: string[],
  jobId: string,
): void {
  if (!urls.length) return;
  const candidates = state.reports.filter(
    (r) =>
      r.reportKind === "integration" &&
      !r.kiploksAnalyzeUrl &&
      (r.source === integration || r.source === "integration"),
  );
  if (!candidates.length) return;
  for (let i = 0; i < Math.min(urls.length, candidates.length); i++) {
    const url = urls[i];
    const report = candidates[i];
    if (!url || !report) continue;
    report.kiploksAnalyzeUrl = url;
    pushCloudAnalyzeLink(url, {
      source: "integration_run_logs",
      integration,
      jobId,
      reportId: report.id,
    });
  }
}

function buildOrchestratorUrlForDockerClients(port: number): string {
  const fromEnv = process.env.KIPLOKS_ORCHESTRATOR_HOST?.trim();
  if (fromEnv) return normalizeOrigin(fromEnv);
  if (process.platform === "darwin" || process.platform === "win32") {
    return `http://host.docker.internal:${port}`;
  }
  return `http://172.17.0.1:${port}`;
}

function fallbackScanBacktestArtifacts(canonicalPath: string): Array<Record<string, unknown>> {
  const dir = join(canonicalPath, "user_data", "backtest_results");
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir)
    .filter((n) => (n.endsWith(".json") || n.endsWith(".zip")) && !n.startsWith("."))
    .filter((n) => !n.endsWith(".meta.json") && !n.includes("_meta") && !n.includes("_config"))
    .sort((a, b) => {
      try {
        return statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });
  return names.slice(0, 500).map((name, idx) => {
    const p = join(dir, name);
    let mtime = "";
    let size = 0;
    try {
      const st = statSync(p);
      mtime = new Date(st.mtimeMs).toISOString();
      size = st.size;
    } catch {
      // ignore per-file stat errors
    }
    return {
      artifactKey: `file:${name}`,
      sourceFile: name,
      runIndex: idx,
      strategy: "",
      symbol: "",
      startDate: "",
      endDate: "",
      mtime,
      sizeBytes: size,
    };
  });
}

export async function runUiServer(args: UiCommandArgs): Promise<void> {
  const preferredPort = Number.isFinite(args.port) ? (args.port as number) : 41731;
  const maxAttempts = 20;
  const server = createServer(async (req, res) => handleRequest(req, res));

  const port = await listenWithFallback(server, preferredPort, maxAttempts);
  const url = `http://127.0.0.1:${port}`;
  state.localApiBaseUrl = url;
  state.localApiDockerBaseUrl = buildOrchestratorUrlForDockerClients(port);
  const cliRoot = join(__dirname, "..", "..");
  const demoCount = seedDemoReportsFromKiploksSaaSFixtures(cliRoot);
  if (demoCount > 0) {
    process.stdout.write(
      `Loaded ${demoCount} demo report(s) from SaaS-aligned fixtures (e.g. ${url}/ui/#report=demo_saas_robust). Env KIPLOKS_UI_SEED_SAAS_DEMOS=1.\n`,
    );
  } else {
    process.stdout.write(
      "Demo reports are off. Set KIPLOKS_UI_SEED_SAAS_DEMOS=1 before start to load demo_saas_robust / demo_saas_paper_tiger.\n",
    );
  }
  process.stdout.write(`kiploks ui is running at ${url}\n`);
  process.stdout.write(`Orchestrator API for Docker-based integrations: ${state.localApiDockerBaseUrl}\n`);
  process.stdout.write("Press Ctrl+C to stop.\n");

  let viteServer: ViteDevServer | null = null;

  if (args.watch) {
    process.env.KIPLOKS_ORCHESTRATOR_ORIGIN = url;
    try {
      const { createServer: createViteServer } = await import("vite");
      viteServer = await createViteServer({
        configFile: join(cliRoot, "web", "vite.config.mjs"),
      });
      await viteServer.listen();
      viteServer.printUrls();
      const locals = viteServer.resolvedUrls?.local ?? [];
      const raw = locals[0] || `http://127.0.0.1:${viteServer.config.server.port}`;
      const withSlash = raw.endsWith("/") ? raw : `${raw}/`;
      const uiUrl = /\/ui\/?$/.test(withSlash) ? withSlash : `${withSlash}ui/`;
      process.stdout.write(`Local UI dev (Vite HMR): ${uiUrl}\n`);
      process.stdout.write(`API is proxied from the Vite origin to ${url}\n`);
      if (args.open !== false) openBrowser(uiUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `Failed to start Vite for --watch (${msg}). Install devDependencies in this package (vite) and retry.\n`,
      );
      server.close();
      process.exitCode = 1;
      return;
    }
  } else if (args.open !== false) {
    openBrowser(`${url}/ui/`);
  }

  await new Promise<void>((resolveDone) => {
    const shutdown = () => {
      void (async () => {
        if (viteServer) {
          try {
            await viteServer.close();
          } catch {
            /* ignore */
          }
          viteServer = null;
        }
        server.close(() => resolveDone());
      })();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

async function listenWithFallback(server: ReturnType<typeof createServer>, preferredPort: number, maxAttempts: number): Promise<number> {
  for (let i = 0; i <= maxAttempts; i++) {
    const port = preferredPort + i;
    const ok = await tryListen(server, port);
    if (ok) return port;
  }
  throw new Error(`Unable to bind local UI server near port ${preferredPort}`);
}

async function tryListen(server: ReturnType<typeof createServer>, port: number): Promise<boolean> {
  return new Promise<boolean>((resolvePromise, rejectPromise) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") resolvePromise(false);
      else rejectPromise(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET";
  const url = req.url || "/";
  const pathOnly = url.split("?")[0] || "/";
  try {
    if (tryServeUiWebRequest(req, res, pathOnly)) {
      return;
    }

    if (method === "GET" && pathOnly === "/") {
      res.statusCode = 302;
      res.setHeader("Location", "/ui/");
      res.end();
      return;
    }

    if (method === "GET" && url === "/api-info") {
      sendJson(res, 200, {
        name: "kiploks local orchestrator",
        ui: "/ui/",
        localApiBaseUrl: state.localApiBaseUrl,
        localApiDockerBaseUrl: state.localApiDockerBaseUrl,
        routes: [
          "GET /api/reports",
          "GET /api/reports/:id",
          "PATCH /api/reports/:id (reportName without auth; Bearer required for kiploksAnalyzeUrl / orchestratorShellUrl)",
          "GET /api/integration/analyze-status",
          "POST /api/integration/results",
          "POST /preflight/check",
          "GET /preflight/result",
          "GET /paths",
          "POST /paths/register",
          "DELETE /paths/:integration",
          "POST /csv/analyze",
          "POST /integrations/bootstrap",
          "GET /integrations/kiploks-config?integration=freqtrade|octobot",
          "POST /integrations/kiploks-config",
          "POST /integrations/run",
          "GET /jobs",
          "GET /jobs/:id",
          "GET /jobs/:id/logs",
          "GET /jobs/:id/events",
          "GET /jobs/:id/result",
          "POST /jobs/:id/cancel",
        ],
      });
      return;
    }

    if (method === "GET" && url === "/api/reports") {
      sendJson(
        res,
        200,
        state.reports.map((r) => buildReportListRow(r)),
      );
      return;
    }

    if (method === "GET" && url === "/api/cloud-analyze-links") {
      sendJson(res, 200, state.cloudAnalyzeLinks);
      return;
    }

    if (method === "GET" && pathOnly.startsWith("/api/reports/")) {
      const id = pathOnly.slice("/api/reports/".length);
      if (!id || id.includes("/")) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const report = state.reports.find((r) => r.id === id);
      if (!report) {
        sendJson(res, 404, { error: `Report ${id} not found` });
        return;
      }
      sendJson(res, 200, report);
      return;
    }

    if (method === "PATCH" && pathOnly.startsWith("/api/reports/")) {
      const id = pathOnly.slice("/api/reports/".length);
      if (!id || id.includes("/")) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const report = state.reports.find((r) => r.id === id);
      if (!report) {
        sendJson(res, 404, { error: `Report ${id} not found` });
        return;
      }
      const patchBody = (await readJsonBody(req)) as {
        reportName?: unknown;
        kiploksAnalyzeUrl?: unknown;
        orchestratorShellUrl?: unknown;
      };
      const wantsReportNamePatch = Object.prototype.hasOwnProperty.call(patchBody, "reportName");
      const wantsProtectedPatch =
        typeof patchBody.kiploksAnalyzeUrl === "string" || typeof patchBody.orchestratorShellUrl === "string";
      if (wantsProtectedPatch) {
        const auth = readBearerToken(req);
        if (!auth || auth !== state.localApiToken) {
          sendJson(res, 401, { error: "Missing Authorization header (Bearer API key required)" });
          return;
        }
      }
      if (wantsReportNamePatch) {
        if (patchBody.reportName === null) {
          report.reportName = null;
        } else if (typeof patchBody.reportName === "string") {
          const t = patchBody.reportName.trim();
          report.reportName = t || null;
        } else {
          sendJson(res, 400, { error: "reportName must be string or null" });
          return;
        }
      }
      if (typeof patchBody.kiploksAnalyzeUrl === "string") {
        const t = patchBody.kiploksAnalyzeUrl.trim();
        report.kiploksAnalyzeUrl = EXTERNAL_ANALYZE_PAGE_RE.test(t) ? t : null;
      }
      if (typeof patchBody.orchestratorShellUrl === "string") {
        const t = patchBody.orchestratorShellUrl.trim();
        report.orchestratorShellUrl = t && t.includes("#report=") ? t : report.orchestratorShellUrl;
      }
      sendJson(res, 200, { ok: true, id: report.id, report: buildReportListRow(report) });
      return;
    }

    if (url === "/api/integration/analyze-status") {
      const auth = readBearerToken(req);
      if (!auth || auth !== state.localApiToken) {
        sendJson(res, 401, { error: "Missing Authorization header (Bearer API key required)" });
        return;
      }
      sendJson(res, 200, {
        allowed: true,
        storageFull: false,
        storageUsed: state.reports.length,
        storageLimit: 100000,
      });
      return;
    }

    if (method === "POST" && url === "/api/integration/results") {
      const auth = readBearerToken(req);
      if (!auth || auth !== state.localApiToken) {
        sendJson(res, 401, { error: "Missing Authorization header (Bearer API key required)" });
        return;
      }
      const body = (await readJsonBody(req)) as {
        results?: unknown[];
        source?: string;
        kiploksAnalyzeUrl?: unknown;
        kiploksAnalyzeUrls?: unknown;
        analyzeUrls?: unknown;
      };
      if (!Array.isArray(body?.results) || body.results.length === 0) {
        sendJson(res, 400, { error: "results must be a non-empty array" });
        return;
      }

      const analyzeUrls: string[] = [];
      const reportIds: string[] = [];
      const batchTotal = body.results.length;
      for (let i = 0; i < body.results.length; i++) {
        const raw = body.results[i] as Record<string, unknown>;
        const unified = mapPayloadToUnified(raw);
        const report = buildTestResultDataFromUnified(unified, `local_${Date.now()}_${i}`);
        const reportId = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const shellUrl = `${state.localApiBaseUrl}/ui/#report=${reportId}`;
        const kiploksUrl = pickKiploksAnalyzeUrlForResult(body, i, raw);
        const item: LocalReport = {
          id: reportId,
          createdAt: new Date().toISOString(),
          source: body.source || "integration",
          reportName: null,
          symbol:
            (raw?.symbol as string | undefined) ||
            ((raw?.backtestResult as Record<string, unknown> | undefined)?.symbol as string | undefined) ||
            null,
          strategy:
            (raw?.strategy as string | undefined) ||
            ((raw?.parameters as Record<string, unknown> | undefined)?.strategy as string | undefined) ||
            null,
          reportKind: "integration",
          batchIndex: i,
          batchTotal,
          kiploksAnalyzeUrl: kiploksUrl,
          orchestratorShellUrl: pickOrchestratorShellUrlForResult(raw, shellUrl),
          report,
          rawPayload: raw,
        };
        state.reports.unshift(item);
        if (kiploksUrl) {
          pushCloudAnalyzeLink(kiploksUrl, {
            source: "integration_result_payload",
            integration: body.source === "freqtrade" || body.source === "octobot" ? body.source : undefined,
            reportId: reportId,
          });
        }
        analyzeUrls.push(shellUrl);
        reportIds.push(reportId);
      }
      sendJson(res, 200, { success: true, analyzeUrls, reportIds });
      return;
    }

    if (method === "POST" && url === "/preflight/check") {
      state.lastPreflight = runPreflight();
      sendJson(res, 200, state.lastPreflight);
      return;
    }

    if (method === "GET" && url === "/preflight/result") {
      sendJson(res, 200, state.lastPreflight);
      return;
    }

    if (method === "GET" && url === "/paths") {
      sendJson(res, 200, Array.from(state.paths.values()));
      return;
    }

    if (method === "POST" && url === "/paths/register") {
      const body = await readJsonBody(req) as { integration: IntegrationKind; path: string };
      if (!body?.integration || !body?.path) {
        sendJson(res, 400, { error: "integration and path are required" });
        return;
      }
      if (body.integration !== "freqtrade" && body.integration !== "octobot") {
        sendJson(res, 400, { error: "integration must be freqtrade or octobot" });
        return;
      }
      const canonicalPath = resolve(body.path);
      if (!existsSync(canonicalPath)) {
        sendJson(res, 400, { error: `Path does not exist: ${canonicalPath}` });
        return;
      }
      const item: SavedPath = {
        integration: body.integration,
        displayPath: body.path,
        canonicalPath,
        updatedAt: new Date().toISOString(),
      };
      state.paths.set(body.integration, item);
      sendJson(res, 200, item);
      return;
    }

    if (method === "POST" && url === "/system/select-directory") {
      const selectedPath = selectDirectoryFromSystemDialog();
      sendJson(res, 200, { path: selectedPath });
      return;
    }

    if (method === "DELETE" && url.startsWith("/paths/")) {
      const integration = url.slice("/paths/".length) as IntegrationKind;
      const deleted = state.paths.delete(integration);
      sendJson(res, 200, { deleted });
      return;
    }

    if (method === "POST" && url === "/csv/analyze") {
      const body = await readJsonBody(req) as {
        csv: string;
        mapping?: { profit?: string };
        config?: { seed?: number; decimals?: number };
      };
      const job = runCsvAnalyze(body);
      sendJson(res, 200, job);
      return;
    }

    if (method === "POST" && url === "/integrations/bootstrap") {
      const body = (await readJsonBody(req)) as {
        integration: IntegrationKind;
        mode?: "safe-merge" | "replace-managed";
      };
      const job = runIntegrationBootstrap(body);
      sendJson(res, 200, job);
      return;
    }

    if (method === "GET" && url.startsWith("/integrations/kiploks-config")) {
      const q = parseQueryString(url);
      const integration = q.integration as IntegrationKind;
      if (integration !== "freqtrade" && integration !== "octobot") {
        sendJson(res, 400, { error: "integration must be freqtrade or octobot" });
        return;
      }
      try {
        const payload = readKiploksConfigForGet(integration);
        sendJson(res, 200, payload);
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (method === "POST" && url === "/integrations/kiploks-config") {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const integration = body.integration as IntegrationKind;
      if (integration !== "freqtrade" && integration !== "octobot") {
        sendJson(res, 400, { error: "integration must be freqtrade or octobot" });
        return;
      }
      try {
        const result = saveKiploksConfigFromUi(integration, body);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (method === "POST" && url === "/integrations/config/reset-defaults") {
      const body = (await readJsonBody(req)) as { integration: IntegrationKind };
      const result = resetIntegrationConfig(body.integration);
      sendJson(res, 200, result);
      return;
    }

    if (method === "POST" && url === "/integrations/config/replace") {
      const body = (await readJsonBody(req)) as { integration: IntegrationKind; config: Record<string, unknown> };
      const result = replaceIntegrationConfig(body.integration, body.config);
      sendJson(res, 200, result);
      return;
    }

    if (method === "POST" && url === "/integrations/config/merge") {
      const body = (await readJsonBody(req)) as { integration: IntegrationKind; patch: Record<string, unknown> };
      const result = mergeIntegrationConfig(body.integration, body.patch);
      sendJson(res, 200, result);
      return;
    }

    if (method === "POST" && url === "/integrations/run") {
      const body = (await readJsonBody(req)) as {
        integration: IntegrationKind;
        mode?: "docker" | "host" | "wrapper";
        extraArgs?: string[];
        selectedArtifactKeys?: string[];
      };
      const job = createJob("integration_run");
      sendJson(res, 200, job);
      void runIntegrationCommand(job, body);
      return;
    }

    if (method === "GET" && url.startsWith("/integrations/backtests")) {
      const q = parseQueryString(url);
      const integration = q.integration as IntegrationKind;
      if (integration !== "freqtrade") {
        sendJson(res, 200, { items: [], log: "Backtest list is currently supported only for freqtrade." });
        return;
      }
      const saved = state.paths.get(integration);
      if (!saved) {
        sendJson(res, 200, { items: [], log: "Repository path is not registered for freqtrade." });
        return;
      }
      const scriptPath = join(saved.canonicalPath, "kiploks-freqtrade", "run.py");
      if (!existsSync(scriptPath)) {
        sendJson(res, 200, {
          items: [],
          log:
            "run.py was not found at expected path: " +
            scriptPath +
            ". Register repository root that contains kiploks-freqtrade and user_data.",
        });
        return;
      }
      const py = spawnSync("python3", [scriptPath, "--list-backtests-json"], {
        cwd: saved.canonicalPath,
        encoding: "utf8",
      });
      const raw = `${py.stdout ?? ""}\n${py.stderr ?? ""}`;
      const marker = raw
        .split("\n")
        .find((line) => line.startsWith("KIPLOKS_BACKTEST_LIST_JSON:"))
        ?.slice("KIPLOKS_BACKTEST_LIST_JSON:".length)
        .trim();
      if (!marker) {
        const fallbackItems = fallbackScanBacktestArtifacts(saved.canonicalPath);
        sendJson(res, 200, {
          items: fallbackItems,
          log: `Backtest list loaded via fallback scan (${fallbackItems.length} file(s)).`,
        });
        return;
      }
      try {
        const parsed = JSON.parse(marker) as unknown;
        const items = Array.isArray(parsed) ? parsed : [];
        sendJson(res, 200, {
          items,
          log:
            `Scan OK. cwd=${saved.canonicalPath}. script=${scriptPath}. found=${items.length}. ` +
            `exit=${py.status ?? "unknown"}.`,
        });
      } catch {
        sendJson(res, 200, {
          items: [],
          log: "Backtest scan returned invalid marker payload.",
        });
      }
      return;
    }

    if (method === "GET" && url === "/jobs") {
      sendJson(res, 200, state.jobs.slice().reverse());
      return;
    }

    if (method === "POST" && url.startsWith("/jobs/") && url.endsWith("/cancel")) {
      const parts = url.split("/").filter(Boolean);
      const id = parts[1];
      const job = state.jobs.find((j) => j.id === id);
      if (!job) {
        sendJson(res, 404, { error: `Job ${id} not found` });
        return;
      }
      if (job.status === "succeeded" || job.status === "failed") {
        sendJson(res, 200, { cancelled: false });
        return;
      }
      job.status = "cancelled";
      job.updatedAt = new Date().toISOString();
      job.logs.push("job cancelled");
      if (job.type === "integration_run") {
        const proc = state.integrationRunProcesses.get(job.id);
        if (proc && !proc.killed) {
          try {
            proc.kill("SIGTERM");
          } catch {
            // ignore; close handler will finalize status
          }
        }
      }
      sendJson(res, 200, { cancelled: true });
      return;
    }

    if (method === "GET" && url.startsWith("/jobs/")) {
      const parts = url.split("/").filter(Boolean);
      const id = parts[1];
      const job = state.jobs.find((j) => j.id === id);
      if (!job) {
        sendJson(res, 404, { error: `Job ${id} not found` });
        return;
      }
      if (parts.length === 2) {
        sendJson(res, 200, job);
        return;
      }
      if (parts[2] === "logs") {
        sendJson(res, 200, { logs: job.logs });
        return;
      }
      if (parts[2] === "events") {
        openJobEventStream(job.id, res);
        return;
      }
      if (parts[2] === "result") {
        sendJson(res, 200, { status: job.status, result: job.result, error: job.error });
        return;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function runPreflight(): PreflightResult {
  const pythonCommands = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  const dockerCommands = ["docker"];
  const pythonOk = pythonCommands.some((cmd) => commandExists(cmd));
  const dockerOk = dockerCommands.some((cmd) => commandExists(cmd));
  return {
    checkedAt: new Date().toISOString(),
    python: { ok: pythonOk, commandTried: pythonCommands },
    docker: { ok: dockerOk, commandTried: dockerCommands },
    node: { ok: true, version: process.version },
  };
}

function runCsvAnalyze(body: {
  csv: string;
  mapping?: { profit?: string };
  config?: { seed?: number; decimals?: number };
}): JobRecord {
  const job = createJob("csv_analyze");
  try {
    if (!body?.csv || typeof body.csv !== "string") {
      throw new Error("csv field is required");
    }
    const profitColumn = body.mapping?.profit || "profit";
    const profits = extractProfits(body.csv, profitColumn);
    if (profits.length < 3) {
      throw new Error("CSV must contain at least 3 valid rows in profit column");
    }
    const result = analyze(
      { trades: profits.map((profit) => ({ profit })) },
      { seed: body.config?.seed, decimals: body.config?.decimals },
    );
    setJobResult(job, {
      meta: { parsedRows: profits.length, profitColumn },
      analysis: result,
    });
    setJobSucceeded(job, "csv_analyze completed");
  } catch (error) {
    setJobFailed(job, error, "csv_analyze failed");
  }
  return job;
}

function runIntegrationBootstrap(body: {
  integration: IntegrationKind;
  mode?: "safe-merge" | "replace-managed";
}): JobRecord {
  const job = createJob("integration_bootstrap");
  try {
    const integration = body.integration;
    if (integration !== "freqtrade" && integration !== "octobot") {
      throw new Error("integration must be freqtrade or octobot");
    }
    const saved = state.paths.get(integration);
    if (!saved) {
      throw new Error(`Path for ${integration} is not registered`);
    }
    const targetRoot = join(saved.canonicalPath, `kiploks-${integration}`);
    const mode = body.mode ?? "safe-merge";
    mkdirSync(targetRoot, { recursive: true });
    appendLog(job, `bootstrap target: ${targetRoot}`);
    const packageRepo = getIntegrationRepoUrl(integration);
    const packageReady = ensureIntegrationPackage(integration, saved.canonicalPath, mode);
    appendLog(job, packageReady.message);

    const manifestPath = join(targetRoot, ".kiploks-integration-manifest.json");
    const existingManifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8")) as { template_version?: string; engine_version?: string }
      : null;

    const files = buildTemplateFiles(integration);
    for (const file of files) {
      const fullPath = join(targetRoot, file.path);
      const shouldWrite = mode === "replace-managed" || !existsSync(fullPath);
      if (shouldWrite) {
        writeFileSync(fullPath, file.content, "utf8");
      }
    }

    const manifest = {
      managed_by: "kiploks-orchestrator",
      integration,
      engine_version: "0.3.0",
      template_version: "1",
      generated_at: new Date().toISOString(),
      files: files.map((f) => f.path),
      upgrade_available: existingManifest?.template_version !== "1",
      previous_engine_version: existingManifest?.engine_version ?? null,
      source_repo: packageRepo,
      package_state: packageReady.state,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    ensureLocalApiConfig(targetRoot, integration);

    setJobResult(job, {
      integration,
      mode,
      targetRoot,
      source_repo: packageRepo,
      manifest,
    });
    setJobSucceeded(job, `bootstrap completed for ${integration}`);
  } catch (error) {
    setJobFailed(job, error, "bootstrap failed");
  }
  return job;
}

async function runIntegrationCommand(
  job: JobRecord,
  body: {
    integration: IntegrationKind;
    mode?: "docker" | "host" | "wrapper";
    extraArgs?: string[];
    selectedArtifactKeys?: string[];
  },
): Promise<void> {
  try {
    const integration = body.integration;
    if (integration !== "freqtrade" && integration !== "octobot") {
      throw new Error("integration must be freqtrade or octobot");
    }
    const saved = state.paths.get(integration);
    if (!saved) {
      throw new Error(`Path for ${integration} is not registered`);
    }
    assertIntegrationRunnersPresent(saved.canonicalPath, integration, body.mode);
    const runSpec = resolveRunSpec(integration, body.mode);
    const args = [...runSpec.args, ...(body.extraArgs ?? [])];
    if (Array.isArray(body.selectedArtifactKeys) && body.selectedArtifactKeys.length > 0) {
      const clean = body.selectedArtifactKeys.map((x) => String(x || "").trim()).filter(Boolean);
      if (clean.length > 0) {
        args.push(`--selected-artifact-keys=${clean.join(",")}`);
      }
    }
    if (runSpec.command.endsWith(".sh")) {
      const scriptPath = join(saved.canonicalPath, runSpec.command.replace(/^\.\//, ""));
      if (existsSync(scriptPath) && process.platform !== "win32") {
        spawnSync("chmod", ["+x", scriptPath], { encoding: "utf8" });
      }
    }
    appendLog(job, `running: ${runSpec.command} ${args.join(" ")}`);
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn(runSpec.command, args, {
        cwd: saved.canonicalPath,
        shell: runSpec.shell,
        env: process.env,
      });
      state.integrationRunProcesses.set(job.id, child);
      child.stdout.on("data", (chunk: Buffer | string) => {
        const message = String(chunk).trim();
        appendLog(job, message);
        collectLines(stdoutLines, message);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        const message = String(chunk).trim();
        appendLog(job, message);
        collectLines(stderrLines, message);
      });
      child.on("error", rejectRun);
      child.on("close", (code) => {
        state.integrationRunProcesses.delete(job.id);
        if (job.status === "cancelled") {
          resolveRun();
          return;
        }
        if (code === 0) resolveRun();
        else rejectRun(new Error(`process exited with code ${code ?? "unknown"}`));
      });
    });

    if (job.status === "cancelled") {
      return;
    }

    const allOutputLines = [...stdoutLines, ...stderrLines];
    const markers = parseRunMarkers(allOutputLines);
    const analyzeUrlsFromLogs = extractAnalyzeUrlsFromOutput(allOutputLines);
    const orchestratorReportUrlsFromLogs = extractOrchestratorReportUrlsFromOutput(allOutputLines);
    let artifactPreview: unknown = null;
    if (markers.resultPath) {
      const resolvedPath = resolve(saved.canonicalPath, markers.resultPath);
      if (existsSync(resolvedPath)) {
        try {
          artifactPreview = JSON.parse(readFileSync(resolvedPath, "utf8"));
        } catch {
          artifactPreview = { note: "artifact exists but is not valid JSON preview" };
        }
      }
    }
    setJobResult(job, {
      integration,
      cwd: saved.canonicalPath,
      command: runSpec.command,
      args,
      status_marker: markers.status ?? "process_exit_code_0",
      result_path_marker: markers.resultPath ?? null,
      analyzeUrls: analyzeUrlsFromLogs,
      orchestratorReportUrls: orchestratorReportUrlsFromLogs,
      artifact_preview: artifactPreview,
    });
    if (analyzeUrlsFromLogs.length > 0) {
      backfillAnalyzeUrlsIntoRecentReports(integration, analyzeUrlsFromLogs, job.id);
      for (const u of analyzeUrlsFromLogs) {
        pushCloudAnalyzeLink(u, {
          source: "integration_run_logs",
          integration,
          jobId: job.id,
        });
      }
    }
    const uploadLine = detectKiploksUploadFailureFromOutput(allOutputLines);
    if (uploadLine) {
      setJobFailed(
        job,
        new Error(
          "Kiploks upload did not complete. Check the log for the server message (e.g. missing oos_trades, HTTP 4xx/5xx, or rate limits). " +
            uploadLine,
        ),
        "integration run failed",
      );
      return;
    }
    setJobSucceeded(job, "integration run completed");
  } catch (error) {
    if (job.status === "cancelled") {
      return;
    }
    setJobFailed(job, error, "integration run failed");
  } finally {
    state.integrationRunProcesses.delete(job.id);
  }
}

function assertIntegrationRunnersPresent(
  canonicalPath: string,
  integration: IntegrationKind,
  mode?: "docker" | "host" | "wrapper",
): void {
  const pkg = join(canonicalPath, `kiploks-${integration}`);
  const need = (rel: string) => {
    const p = join(pkg, rel);
    if (!existsSync(p)) {
      throw new Error(
        `Missing ${p}. Run Bootstrap to install the integration package (use replace-managed if the folder exists but is incomplete).`,
      );
    }
  };
  if (integration === "freqtrade") {
    need("run-in-docker.sh");
    return;
  }
  if (mode === "wrapper") {
    need("run.sh");
  } else {
    need("run.py");
  }
}

function resolveRunSpec(
  integration: IntegrationKind,
  mode?: "docker" | "host" | "wrapper",
): { command: string; args: string[]; shell: boolean } {
  if (integration === "freqtrade") {
    return { command: "./kiploks-freqtrade/run-in-docker.sh", args: [], shell: true };
  }
  if (mode === "wrapper") return { command: "./kiploks-octobot/run.sh", args: [], shell: true };
  return { command: "python", args: ["kiploks-octobot/run.py"], shell: false };
}

function buildTemplateFiles(integration: IntegrationKind): Array<{ path: string; content: string }> {
  const commonReadme =
    integration === "freqtrade"
      ? [
          "# Kiploks Freqtrade Bridge",
          "",
          "Run commands from repo root:",
          "- Docker mode: ./kiploks-freqtrade/run-in-docker.sh",
          "- Host mode: python kiploks-freqtrade/run.py",
          "",
        ].join("\n")
      : [
          "# Kiploks OctoBot Bridge",
          "",
          "Run commands from repo root:",
          "- Host mode: python kiploks-octobot/run.py",
          "- Wrapper mode: ./kiploks-octobot/run.sh",
          "",
        ].join("\n");
  const defaultConfig = JSON.stringify(getFullDefaultKiploksJson(integration), null, 2);
  return [
    { path: "README.md", content: commonReadme },
    { path: "kiploks.json.example", content: `${defaultConfig}\n` },
    { path: "kiploks.json", content: `${defaultConfig}\n` },
  ];
}

function getIntegrationRepoUrl(integration: IntegrationKind): string {
  return integration === "freqtrade"
    ? "https://github.com/kiploks/kiploks-freqtrade.git"
    : "https://github.com/kiploks/kiploks-octobot.git";
}

function ensureIntegrationPackage(
  integration: IntegrationKind,
  repoRoot: string,
  mode: "safe-merge" | "replace-managed",
): { state: "installed" | "updated" | "kept"; message: string } {
  const packageDir = join(repoRoot, `kiploks-${integration}`);
  const packageDirExists = existsSync(packageDir);
  const packageDirHasFiles = packageDirExists && readdirSync(packageDir).length > 0;
  const isGit = existsSync(join(packageDir, ".git"));
  const hasRunner =
    integration === "freqtrade"
      ? existsSync(join(packageDir, "run.py")) && existsSync(join(packageDir, "run-in-docker.sh"))
      : existsSync(join(packageDir, "run.py")) || existsSync(join(packageDir, "run.sh"));

  if (hasRunner && mode === "safe-merge") {
    ensureExecutableScripts(packageDir, integration);
    return { state: "kept", message: "Existing integration package detected, keeping files (safe-merge)." };
  }

  const repoUrl = getIntegrationRepoUrl(integration);
  if (!isGit) {
    if (mode === "replace-managed" && packageDirExists) {
      rmSync(packageDir, { recursive: true, force: true });
    } else if (mode === "safe-merge" && packageDirHasFiles && !hasRunner) {
      throw new Error(
        `Integration folder ${packageDir} exists but is missing required scripts (e.g. run.py). ` +
          `Delete or empty that folder and run Bootstrap again, or use Bootstrap mode replace-managed to reinstall from GitHub.`,
      );
    }
    if (!existsSync(packageDir)) {
      mkdirSync(packageDir, { recursive: true });
    }
    const clone = spawnSync("git", ["clone", "--depth", "1", repoUrl, packageDir], {
      encoding: "utf8",
    });
    if (clone.status !== 0) {
      const stderr = (clone.stderr ?? "").trim();
      const stdout = (clone.stdout ?? "").trim();
      throw new Error(
        `Failed to clone integration package from ${repoUrl}. ${stderr || stdout || "Unknown git error"}`,
      );
    }
    ensureExecutableScripts(packageDir, integration);
    return { state: "installed", message: `Installed integration package from ${repoUrl}` };
  }

  const pull = spawnSync("git", ["-C", packageDir, "pull", "--ff-only"], {
    encoding: "utf8",
  });
  if (pull.status !== 0) {
    const stderr = (pull.stderr ?? "").trim();
    const stdout = (pull.stdout ?? "").trim();
    throw new Error(`Failed to update integration package in ${packageDir}. ${stderr || stdout || "Unknown git error"}`);
  }
  ensureExecutableScripts(packageDir, integration);
  return { state: "updated", message: `Updated integration package from ${repoUrl}` };
}

function ensureExecutableScripts(packageDir: string, integration: IntegrationKind): void {
  if (process.platform === "win32") return;
  const scripts =
    integration === "freqtrade"
      ? [join(packageDir, "run-in-docker.sh")]
      : [join(packageDir, "run.sh")];
  for (const scriptPath of scripts) {
    if (!existsSync(scriptPath)) continue;
    const chmod = spawnSync("chmod", ["+x", scriptPath], { encoding: "utf8" });
    if (chmod.status !== 0) {
      const stderr = (chmod.stderr ?? "").trim();
      throw new Error(`Failed to set executable permission for ${scriptPath}. ${stderr || "chmod error"}`);
    }
  }
}

function getIntegrationBridgePath(integration: IntegrationKind): string {
  if (integration !== "freqtrade" && integration !== "octobot") {
    throw new Error("integration must be freqtrade or octobot");
  }
  const saved = state.paths.get(integration);
  if (!saved) {
    throw new Error(`Path for ${integration} is not registered`);
  }
  return join(saved.canonicalPath, `kiploks-${integration}`);
}

function resetIntegrationConfig(integration: IntegrationKind): { integration: IntegrationKind; configPath: string } {
  const bridgePath = getIntegrationBridgePath(integration);
  mkdirSync(bridgePath, { recursive: true });
  const configPath = join(bridgePath, "kiploks.json");
  const config = getFullDefaultKiploksJson(integration);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return { integration, configPath };
}

function replaceIntegrationConfig(
  integration: IntegrationKind,
  config: Record<string, unknown>,
): { integration: IntegrationKind; configPath: string } {
  const bridgePath = getIntegrationBridgePath(integration);
  mkdirSync(bridgePath, { recursive: true });
  const configPath = join(bridgePath, "kiploks.json");
  writeFileSync(configPath, JSON.stringify(config ?? {}, null, 2) + "\n", "utf8");
  return { integration, configPath };
}

function mergeIntegrationConfig(
  integration: IntegrationKind,
  patch: Record<string, unknown>,
): { integration: IntegrationKind; configPath: string } {
  const bridgePath = getIntegrationBridgePath(integration);
  mkdirSync(bridgePath, { recursive: true });
  const configPath = join(bridgePath, "kiploks.json");
  const current =
    existsSync(configPath) && readFileSync(configPath, "utf8").trim()
      ? (JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>)
      : {};
  const merged = { ...current, ...(patch ?? {}) };
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return { integration, configPath };
}

function ensureLocalApiConfig(targetRoot: string, integration: IntegrationKind): void {
  const configPath = join(targetRoot, "kiploks.json");
  const defaults = getFullDefaultKiploksJson(integration);
  const current =
    existsSync(configPath) && readFileSync(configPath, "utf8").trim()
      ? (JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>)
      : {};
  const next = { ...defaults, ...current };
  next.api_url = state.localApiDockerBaseUrl;
  next.api_token = state.localApiToken;
  next.local_mode = true;
  next.schema_version = current.schema_version ?? defaults.schema_version;
  next.integration_type = integration;
  next.engine_version = defaults.engine_version;
  next.managed_by = "kiploks-orchestrator";
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

function collectLines(target: string[], message: string): void {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) target.push(line);
}

/** Freqtrade run.py used to exit 0 even when Kiploks upload failed; fail the job if logs say so. */
function detectKiploksUploadFailureFromOutput(lines: string[]): string | null {
  for (const line of lines) {
    if (/Upload failed:/i.test(line)) {
      return line.length > 500 ? line.slice(0, 500) + "..." : line;
    }
  }
  for (const line of lines) {
    if (/Connection refused|\[Errno 111\]/i.test(line)) {
      const short = line.length > 500 ? line.slice(0, 500) + "..." : line;
      return (
        "Network error while contacting upload endpoint - " +
        short +
        ". Check api_url in kiploks.json and that target host:port is reachable from Docker."
      );
    }
  }
  return null;
}

function extractAnalyzeUrlsFromOutput(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const matches = line.match(/https:\/\/[^\s]+\/analyze\/[A-Za-z0-9_-]+[^\s]*/g);
    if (!matches) continue;
    for (const raw of matches) {
      const u = String(raw || "").trim().replace(/[),.;]+$/, "");
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function extractOrchestratorReportUrlsFromOutput(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/[^\s]+#report=[A-Za-z0-9_-]+[^\s)\]'"<>]*/gi;
  for (const line of lines) {
    const matches = line.match(re);
    if (!matches) continue;
    for (const raw of matches) {
      const u = String(raw || "").trim().replace(/[),.;]+$/, "");
      if (!u || !u.includes("#report=") || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function readBearerToken(req: IncomingMessage): string {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

function parseQueryString(fullUrl: string): Record<string, string> {
  const q = fullUrl.includes("?") ? fullUrl.split("?")[1]! : "";
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const v = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : "");
    if (k) out[k] = v;
  }
  return out;
}

function getFullDefaultKiploksJson(integration: IntegrationKind): Record<string, unknown> {
  if (integration === "freqtrade") {
    return {
      top_n: 3,
      skip_already_uploaded: true,
      api_url: state.localApiDockerBaseUrl,
      api_token: state.localApiToken,
      wfaPeriods: 4,
      wfaISSize: 90,
      wfaOOSSize: 30,
      epochs: 10,
      hyperopt_loss: "SharpeHyperOptLoss",
      hyperopt_result_path: "",
      keep_last_n_backtest_files: 0,
      schema_version: 1,
      integration_type: "freqtrade",
      engine_version: "0.3.0",
      managed_by: "kiploks-orchestrator",
      local_mode: true,
    };
  }
  return {
    api_url: state.localApiDockerBaseUrl,
    api_token: state.localApiToken,
    backtesting_path: "",
    top_n: 3,
    wfaPeriods: 3,
    primary_run_id: "",
    wfaISSize: 90,
    wfaOOSSize: 30,
    skip_already_uploaded: true,
    schema_version: 1,
    integration_type: "octobot",
    engine_version: "0.3.0",
    managed_by: "kiploks-orchestrator",
    local_mode: true,
  };
}

function normalizeOrigin(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

function resolveApiTarget(merged: Record<string, unknown>): "local" | "cloud" {
  if (merged.local_mode === true) return "local";
  const u = normalizeOrigin(String(merged.api_url || ""));
  const browserLocal = normalizeOrigin(state.localApiBaseUrl);
  const dockerLocal = normalizeOrigin(state.localApiDockerBaseUrl);
  if (u === browserLocal || u === dockerLocal) return "local";
  if (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")) return "local";
  if (u.startsWith("http://host.docker.internal")) return "local";
  if (/^http:\/\/172\.(17|18|19)\./.test(u)) return "local";
  if (u.includes("kiploks.com")) return "cloud";
  return "cloud";
}

function readKiploksConfigForGet(integration: IntegrationKind): {
  apiTarget: "local" | "cloud";
  config: Record<string, unknown>;
  localApiBaseUrl: string;
  localApiDockerBaseUrl: string;
} {
  const defaults = getFullDefaultKiploksJson(integration);
  const configPath = join(getIntegrationBridgePath(integration), "kiploks.json");
  let disk: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      disk = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      disk = {};
    }
  }
  const merged = { ...defaults, ...disk };
  const apiTarget = resolveApiTarget(merged);
  const config = { ...merged };
  if (apiTarget === "local") {
    config.api_url = state.localApiDockerBaseUrl;
    config.api_token = "";
  }
  return {
    apiTarget,
    config,
    localApiBaseUrl: state.localApiBaseUrl,
    localApiDockerBaseUrl: state.localApiDockerBaseUrl,
  };
}

function saveKiploksConfigFromUi(
  integration: IntegrationKind,
  body: Record<string, unknown>,
): { ok: boolean; configPath: string; apiTarget: "local" | "cloud" } {
  const defaults = getFullDefaultKiploksJson(integration);
  const configPath = join(getIntegrationBridgePath(integration), "kiploks.json");
  let disk: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      disk = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      disk = {};
    }
  }
  const base = { ...defaults, ...disk };
  const apiTarget = body.api_target === "cloud" ? "cloud" : "local";

  const out: Record<string, unknown> = { ...base };

  if (integration === "freqtrade") {
    out.top_n = Number(body.top_n);
    if (!Number.isFinite(out.top_n) || (out.top_n as number) < 1) out.top_n = defaults.top_n;
    out.skip_already_uploaded = Boolean(body.skip_already_uploaded);
    out.wfaPeriods = Number(body.wfaPeriods);
    if (!Number.isFinite(out.wfaPeriods) || (out.wfaPeriods as number) < 1) out.wfaPeriods = defaults.wfaPeriods;
    out.wfaISSize = Number(body.wfaISSize);
    if (!Number.isFinite(out.wfaISSize) || (out.wfaISSize as number) < 1) out.wfaISSize = defaults.wfaISSize;
    out.wfaOOSSize = Number(body.wfaOOSSize);
    if (!Number.isFinite(out.wfaOOSSize) || (out.wfaOOSSize as number) < 1) out.wfaOOSSize = defaults.wfaOOSSize;
    out.epochs = Number(body.epochs);
    if (!Number.isFinite(out.epochs) || (out.epochs as number) < 1) out.epochs = defaults.epochs;
    out.hyperopt_loss = String(body.hyperopt_loss ?? defaults.hyperopt_loss);
    out.hyperopt_result_path = String(body.hyperopt_result_path ?? "");
    const keep = body.keep_last_n_backtest_files;
    if (keep === undefined || keep === null || keep === "") {
      out.keep_last_n_backtest_files = base.keep_last_n_backtest_files ?? defaults.keep_last_n_backtest_files;
    } else {
      const n = Number(keep);
      out.keep_last_n_backtest_files = Number.isFinite(n) && n >= 0 ? n : 0;
    }
  } else {
    out.backtesting_path = String(body.backtesting_path ?? out.backtesting_path ?? "");
    out.top_n = Number(body.top_n);
    if (!Number.isFinite(out.top_n) || (out.top_n as number) < 1) out.top_n = defaults.top_n;
    out.wfaPeriods = Number(body.wfaPeriods);
    if (!Number.isFinite(out.wfaPeriods) || (out.wfaPeriods as number) < 1) out.wfaPeriods = defaults.wfaPeriods;
    out.primary_run_id = String(body.primary_run_id ?? "");
    out.wfaISSize = Number(body.wfaISSize);
    if (!Number.isFinite(out.wfaISSize) || (out.wfaISSize as number) < 1) out.wfaISSize = defaults.wfaISSize;
    out.wfaOOSSize = Number(body.wfaOOSSize);
    if (!Number.isFinite(out.wfaOOSSize) || (out.wfaOOSSize as number) < 1) out.wfaOOSSize = defaults.wfaOOSSize;
    out.skip_already_uploaded = Boolean(body.skip_already_uploaded);
  }

  if (apiTarget === "local") {
    out.api_url = state.localApiDockerBaseUrl;
    out.api_token = state.localApiToken;
    out.local_mode = true;
  } else {
    out.api_url = "https://kiploks.com/";
    out.local_mode = false;
    const submitted = String(body.api_token ?? "").trim();
    const previous = String((base as Record<string, unknown>).api_token ?? "").trim();
    const wasLocalOnDisk = base.local_mode === true;
    if (submitted) {
      out.api_token = submitted;
    } else if (previous && !wasLocalOnDisk) {
      // Do not overwrite an existing Kiploks Cloud key when the form still shows empty (password field) or other fields are saved.
      out.api_token = previous;
    } else {
      out.api_token = "";
    }
  }

  out.schema_version = base.schema_version ?? defaults.schema_version;
  out.integration_type = integration;
  out.engine_version = base.engine_version ?? defaults.engine_version;
  out.managed_by = "kiploks-orchestrator";

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  return { ok: true, configPath, apiTarget };
}

function parseRunMarkers(lines: string[]): { status?: string; resultPath?: string } {
  const out: { status?: string; resultPath?: string } = {};
  for (const line of lines) {
    const statusMatch = line.match(/KIPLOKS_JOB_STATUS\s*[:=]\s*([A-Za-z0-9_-]+)/);
    if (statusMatch?.[1]) out.status = statusMatch[1];
    const pathMatch = line.match(/KIPLOKS_RESULT_PATH\s*[:=]\s*(.+)$/);
    if (pathMatch?.[1]) out.resultPath = pathMatch[1].trim();
  }
  return out;
}

function selectDirectoryFromSystemDialog(): string | null {
  if (process.platform === "darwin") {
    const r = spawnSync(
      "osascript",
      [
        "-e",
        'try',
        "-e",
        'set chosenFolder to choose folder with prompt "Select integration repository folder"',
        "-e",
        "POSIX path of chosenFolder",
        "-e",
        "on error number -128",
        "-e",
        'return ""',
        "-e",
        "end try",
      ],
      { encoding: "utf8" },
    );
    const value = (r.stdout ?? "").trim();
    return value || null;
  }
  if (process.platform === "win32") {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; " +
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; " +
      '$dialog.Description = "Select integration repository folder"; ' +
      "if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }";
    const r = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
    const value = (r.stdout ?? "").trim();
    return value || null;
  }
  const r = spawnSync("zenity", ["--file-selection", "--directory", "--title=Select integration repository folder"], {
    encoding: "utf8",
  });
  const value = (r.stdout ?? "").trim();
  return value || null;
}

function createJob(type: JobType): JobRecord {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    status: "running",
    createdAt: now,
    updatedAt: now,
    logs: [`${type} started`],
  };
  state.jobs.push(job);
  emitEvent(job.id, { type: "job_started", jobType: type, at: now });
  return job;
}

function appendLog(job: JobRecord, message: string): void {
  if (!message) return;
  job.logs.push(message);
  job.updatedAt = new Date().toISOString();
  emitEvent(job.id, { type: "log", at: job.updatedAt, message });
}

function setJobSucceeded(job: JobRecord, message: string): void {
  job.status = "succeeded";
  appendLog(job, message);
  job.updatedAt = new Date().toISOString();
  emitEvent(job.id, { type: "job_finished", status: "succeeded", at: job.updatedAt });
}

function setJobFailed(job: JobRecord, error: unknown, prefix: string): void {
  job.status = "failed";
  job.error = error instanceof Error ? error.message : String(error);
  appendLog(job, `${prefix}: ${job.error}`);
  job.updatedAt = new Date().toISOString();
  emitEvent(job.id, {
    type: "job_finished",
    status: "failed",
    at: job.updatedAt,
    error: job.error,
  });
}

function setJobResult(job: JobRecord, result: unknown): void {
  job.result = result;
  job.updatedAt = new Date().toISOString();
  emitEvent(job.id, { type: "result", at: job.updatedAt });
}

function openJobEventStream(jobId: string, res: ServerResponse<IncomingMessage>): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ jobId })}\n\n`);
  const subscribers = state.streams.get(jobId) ?? new Set<ServerResponse<IncomingMessage>>();
  subscribers.add(res);
  state.streams.set(jobId, subscribers);
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 15000);
  res.on("close", () => {
    clearInterval(heartbeat);
    const current = state.streams.get(jobId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) state.streams.delete(jobId);
  });
}

function emitEvent(jobId: string, payload: unknown): void {
  const subscribers = state.streams.get(jobId);
  if (!subscribers || subscribers.size === 0) return;
  const line = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const subscriber of subscribers) subscriber.write(line);
}

function extractProfits(csv: string, profitColumn: string): number[] {
  const normalized = csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delim = detectDelimiter(lines[0] ?? "", lines[1] ?? "");
  const header = lines[0]!.split(delim).map((cell) => cell.trim());
  const index = header.indexOf(profitColumn);
  if (index < 0) throw new Error(`profit column '${profitColumn}' not found`);
  const out: number[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delim).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const n = Number(cells[index]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function detectDelimiter(line1: string, line2: string): "," | ";" {
  const c = (line1.match(/,/g)?.length || 0) + (line2.match(/,/g)?.length || 0);
  const s = (line1.match(/;/g)?.length || 0) + (line2.match(/;/g)?.length || 0);
  return s > c ? ";" : ",";
}

function commandExists(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, args, {
    shell: process.platform !== "win32",
    stdio: "ignore",
    env: {
      ...process.env,
      PATH: process.env.PATH || delimiter,
    },
  });
  return result.status === 0;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const shell = process.platform === "win32";
  spawnSync(cmd, [url], { stdio: "ignore", shell });
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch (error) {
        rejectPromise(new Error(`Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    req.on("error", rejectPromise);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(json);
}

function guessUiAssetContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".map")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function uiWebDistDir(): string {
  return resolve(join(__dirname, "..", "web"));
}

function sendUiWebFile(res: ServerResponse, absolutePath: string): void {
  if (!existsSync(absolutePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Local UI web bundle missing. From the engine repo run: npm run build -w @kiploks/engine-cli (runs Vite + TypeScript).\n",
    );
    return;
  }
  const buf = readFileSync(absolutePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", guessUiAssetContentType(absolutePath));
  res.end(buf);
}

function tryServeUiWebRequest(req: IncomingMessage, res: ServerResponse, pathOnly: string): boolean {
  if (req.method !== "GET" || !pathOnly.startsWith("/ui")) return false;
  if (pathOnly === "/ui") {
    res.statusCode = 302;
    res.setHeader("Location", "/ui/");
    res.end();
    return true;
  }
  const root = uiWebDistDir();
  const normalized = pathOnly;
  if (normalized === "/ui/") {
    sendUiWebFile(res, join(root, "index.html"));
    return true;
  }
  const prefix = "/ui/";
  if (!normalized.startsWith(prefix)) return false;
  let rel = normalized.slice(prefix.length);
  if (!rel || rel === "") rel = "index.html";
  if (rel.includes("..")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Invalid path");
    return true;
  }
  const abs = resolve(join(root, rel));
  const rootResolved = resolve(root);
  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep;
  if (abs !== rootResolved && !abs.startsWith(rootPrefix)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Invalid path");
    return true;
  }
  sendUiWebFile(res, abs);
  return true;
}
