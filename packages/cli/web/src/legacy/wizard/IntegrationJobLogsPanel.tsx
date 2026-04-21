import type { UiJob } from "../types";
import type { OrchestratorAppContext } from "./useOrchestratorApp";
import { oc } from "./orchestratorUi";
import { useState } from "react";

type Props = { ctx: OrchestratorAppContext };

type ProgressVariant = "idle" | "running" | "ok" | "fail" | "cancelled";

function parseIsoMs(ts: string | undefined): number | null {
  if (!ts) return null;
  const v = Date.parse(ts);
  return Number.isFinite(v) ? v : null;
}

function jobProgress(job: UiJob | null): { pct: number; variant: ProgressVariant } {
  if (!job) return { pct: 0, variant: "idle" };
  const s = job.status;
  if (s === "succeeded") return { pct: 100, variant: "ok" };
  if (s === "failed") return { pct: 100, variant: "fail" };
  if (s === "cancelled") return { pct: 100, variant: "cancelled" };
  const now = Date.now();
  const createdAtMs = parseIsoMs(job.createdAt);
  const updatedAtMs = parseIsoMs(job.updatedAt);
  const ageSec = createdAtMs ? Math.max(0, (now - createdAtMs) / 1000) : 0;
  const sinceUpdateSec = updatedAtMs ? Math.max(0, (now - updatedAtMs) / 1000) : Infinity;
  if (s === "queued") {
    // Queued jobs slowly move until the runner starts.
    return { pct: Math.min(14, 4 + Math.round(ageSec * 0.9)), variant: "running" };
  }
  if (s === "running") {
    const n = job.logs?.length ?? 0;
    // Time curve: 0-20s -> 35%, 20-60s -> 70%, 60-140s -> 90%, then asymptotic to 96%.
    const timePct =
      ageSec <= 20
        ? 10 + (25 * ageSec) / 20
        : ageSec <= 60
          ? 35 + (35 * (ageSec - 20)) / 40
          : ageSec <= 140
            ? 70 + (20 * (ageSec - 60)) / 80
            : Math.min(96, 90 + Math.log10(Math.max(1, ageSec - 139)) * 3.5);
    const logsPct = 12 + Math.min(34, n * 2.4);
    const heartbeatBoost = sinceUpdateSec <= 6 ? 2 : 0;
    const pct = Math.max(12, Math.min(97, Math.max(timePct, logsPct) + heartbeatBoost));
    return { pct, variant: "running" };
  }
  return { pct: 0, variant: "idle" };
}

function barClass(v: ProgressVariant): string {
  if (v === "ok") return "bg-emerald-500";
  if (v === "fail") return "bg-rose-500";
  if (v === "cancelled") return "bg-white/30";
  return "bg-primary";
}

function extractOrchestratorReportUrlsFromLines(lines: string[]): string[] {
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

function mergeUniqueUrls(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...a, ...b]) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function IntegrationJobLogsPanel({ ctx }: Props) {
  if (ctx.isCsvFlow || ctx.orchestratorLayoutStep !== 4) return null;
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const job = ctx.activeIntegrationJob;
  const { pct, variant } = jobProgress(job);
  const logs = job?.logs ?? [];
  const tail = logs.slice(-3);
  const hasMore = logs.length > 3;
  const analyzeUrls = Array.isArray(job?.result?.analyzeUrls)
    ? (job?.result?.analyzeUrls as unknown[])
        .map((u) => String(u || "").trim())
        .filter((u) => /^https:\/\/.+\/analyze\//i.test(u))
    : [];
  const reportUrlsFromResult = Array.isArray(job?.result?.orchestratorReportUrls)
    ? (job?.result?.orchestratorReportUrls as unknown[]).map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  const reportUrls = mergeUniqueUrls(reportUrlsFromResult, job ? extractOrchestratorReportUrlsFromLines(job.logs ?? []) : []);
  const isLocalKiploksTarget = ctx.kiploksUi?.apiTarget === "local";
  const showLocalReportLinks = Boolean(job?.status === "succeeded" && isLocalKiploksTarget && reportUrls.length > 0);

  return (
    <section className={oc.panel}>
      <h2 className={oc.panelTitle}>Logs for active integration job</h2>
      <p className={oc.panelHint}>Latest integration run job only. Last lines update as the run progresses.</p>

      {!job ? (
        <p className="mt-3 text-sm text-muted-foreground">No integration runs yet. Start Run Integration to see logs here.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
            <p className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">
              {job.id} · {job.type}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-end">
              <span
                className={
                  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                  (variant === "ok"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : variant === "fail"
                      ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
                      : variant === "cancelled"
                        ? "bg-muted/40 text-muted-foreground ring-1 ring-border"
                        : "bg-primary/15 text-primary ring-1 ring-primary/30")
                }
              >
                {job.status}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
              <span>Progress</span>
              <span className="tabular-nums text-foreground/90">{Math.round(pct)}%</span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted/40 ring-1 ring-border">
              <div
                className={"h-full rounded-full transition-[width] duration-500 ease-out " + barClass(variant)}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            {job.status === "running" ? (
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/90">
                Percent while running is approximate (based on elapsed time plus log activity).
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-start gap-2">
              {job.status === "queued" || job.status === "running" ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-[150px] items-center justify-center rounded-md border border-border bg-secondary px-2 text-xs font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    if (cancelSubmitting) return;
                    void (async () => {
                      try {
                        setCancelSubmitting(true);
                        await ctx.cancelJob(job.id);
                      } finally {
                        setCancelSubmitting(false);
                      }
                    })();
                  }}
                  disabled={cancelSubmitting}
                >
                  {cancelSubmitting ? "Cancelling..." : "Cancel"}
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Latest activity</p>
            <div className="mt-2 min-w-0 space-y-1 overflow-hidden rounded-lg border border-border bg-muted/20 px-3 py-2">
              {tail.length === 0 ? (
                <p className="text-xs text-muted-foreground">No log lines yet.</p>
              ) : (
                tail.map((line, i) => (
                  <p
                    key={`${logs.length}-${i}`}
                    className="line-clamp-1 min-w-0 break-words font-mono text-[11px] leading-snug text-foreground/85"
                    title={line}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
            {hasMore ? (
              <details className="mt-2 rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground open:bg-muted/40">
                <summary className="cursor-pointer select-none font-medium text-foreground/70 hover:text-foreground">
                  Full log ({logs.length} lines)
                </summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words border-t border-border/30 pt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {logs.join("\n")}
                </pre>
              </details>
            ) : null}
            {analyzeUrls.length > 0 ? (
              <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Analyze link</p>
                {analyzeUrls.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                  >
                    {u}
                  </a>
                ))}
              </div>
            ) : null}
            {showLocalReportLinks ? (
              <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Local orchestrator report</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-sky-100/80">Open in the browser (same host as your local UI).</p>
                {reportUrls.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-sky-200 underline underline-offset-2 hover:text-sky-100"
                  >
                    {u}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
