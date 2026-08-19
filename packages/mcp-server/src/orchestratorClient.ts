const DEFAULT_ORCHESTRATOR_URL = "http://127.0.0.1:41731";

export type OrchestratorConfig = {
  baseUrl: string;
  apiToken?: string;
};

export function resolveOrchestratorConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const baseUrl = (env.KIPLOKS_ORCHESTRATOR_URL ?? DEFAULT_ORCHESTRATOR_URL).replace(/\/+$/, "");
  const apiToken = env.KIPLOKS_ORCHESTRATOR_TOKEN?.trim() || undefined;
  return { baseUrl, apiToken };
}

export class OrchestratorHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function readJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function orchestratorFetch(
  config: OrchestratorConfig,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (config.apiToken) headers.set("Authorization", `Bearer ${config.apiToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  const body = await readJsonResponse(res);
  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new OrchestratorHttpError(res.status, body, message);
  }
  return body;
}

export async function getApiInfo(config: OrchestratorConfig): Promise<unknown> {
  return orchestratorFetch(config, "/api-info", { method: "GET" });
}

export async function listBacktests(
  config: OrchestratorConfig,
  integration: "freqtrade" = "freqtrade",
  botId?: string,
): Promise<unknown> {
  const q = new URLSearchParams({ integration });
  if (botId?.trim()) q.set("bot", botId.trim());
  return orchestratorFetch(config, `/integrations/backtests?${q.toString()}`, { method: "GET" });
}

export async function listReports(config: OrchestratorConfig): Promise<unknown> {
  return orchestratorFetch(config, "/api/reports", { method: "GET" });
}

export async function getReport(config: OrchestratorConfig, reportId: string): Promise<unknown> {
  return orchestratorFetch(config, `/api/reports/${encodeURIComponent(reportId)}`, { method: "GET" });
}

export type RunIntegrationInput = {
  integration?: "freqtrade" | "octobot";
  selectedArtifactKeys?: string[];
  botId?: string;
  mode?: "docker" | "host" | "wrapper";
};

export async function startIntegrationRun(
  config: OrchestratorConfig,
  input: RunIntegrationInput,
): Promise<{ jobId: string; raw: unknown }> {
  const raw = await orchestratorFetch(config, "/integrations/run", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const jobId =
    typeof raw === "object" && raw && "id" in raw ? String((raw as { id: unknown }).id) : "";
  if (!jobId) throw new Error("Integration run did not return a job id");
  return { jobId, raw };
}

export async function getJob(config: OrchestratorConfig, jobId: string): Promise<unknown> {
  return orchestratorFetch(config, `/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
}

export async function getJobResult(config: OrchestratorConfig, jobId: string): Promise<unknown> {
  return orchestratorFetch(config, `/jobs/${encodeURIComponent(jobId)}/result`, { method: "GET" });
}

export async function waitForJob(
  config: OrchestratorConfig,
  jobId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const pollMs = opts.pollMs ?? 2000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const job = await getJob(config, jobId);
    const status =
      typeof job === "object" && job && "status" in job ? String((job as { status: unknown }).status) : "";
    if (status === "succeeded" || status === "failed" || status === "cancelled") {
      return job;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

export async function registerFreqtradePath(
  config: OrchestratorConfig,
  freqtradePath: string,
): Promise<unknown> {
  return orchestratorFetch(config, "/paths/register", {
    method: "POST",
    body: JSON.stringify({ integration: "freqtrade", path: freqtradePath }),
  });
}

export async function bootstrapIntegration(
  config: OrchestratorConfig,
  integration: "freqtrade" | "octobot" = "freqtrade",
): Promise<unknown> {
  return orchestratorFetch(config, "/integrations/bootstrap", {
    method: "POST",
    body: JSON.stringify({ integration }),
  });
}
