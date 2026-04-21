import { useCallback, useEffect, useState } from "react";
import type { UiReportRow } from "../legacy/types";
import { oc } from "../legacy/wizard/orchestratorUi";
import { ReportSurface } from "./report/ReportSurface";

/** Shell Step 5: list + full report body (same renderer as legacy ReportsManagerPanel). */
export function ShellReportsStep() {
  const [reports, setReports] = useState<UiReportRow[]>([]);
  const [jobs, setJobs] = useState<Array<{ type?: string; status?: string; result?: { analyzeUrls?: unknown } }>>([]);
  const [cloudLinks, setCloudLinks] = useState<Array<{ url?: string; createdAt?: string }>>([]);
  const [selectedId, setSelectedId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [r, j, c] = await Promise.all([fetch("/api/reports"), fetch("/jobs"), fetch("/api/cloud-analyze-links")]);
      const data = (await r.json()) as unknown;
      const jobsData = (await j.json()) as unknown;
      const cloudData = (await c.json()) as unknown;
      setReports(Array.isArray(data) ? (data as UiReportRow[]) : []);
      setJobs(Array.isArray(jobsData) ? (jobsData as Array<{ type?: string; status?: string; result?: { analyzeUrls?: unknown } }>) : []);
      setCloudLinks(Array.isArray(cloudData) ? (cloudData as Array<{ url?: string; createdAt?: string }>) : []);
    } catch {
      setReports([]);
      setJobs([]);
      setCloudLinks([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const m = String(window.location.hash || "").match(/^#report=(.+)$/);
    const fromHash = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (fromHash) setSelectedId(fromHash);
  }, []);

  useEffect(() => {
    if (!selectedId && reports[0]?.id) setSelectedId(reports[0].id);
  }, [reports, selectedId]);

  const onSelect = (id: string) => {
    setSelectedId(id);
    if (id) window.location.hash = `#report=${encodeURIComponent(id)}`;
    else window.location.hash = "";
  };

  const latestAnalyzeUrls = (() => {
    const runJob = jobs.find((x) => x?.type === "integration_run");
    const arr = runJob?.result?.analyzeUrls;
    if (!Array.isArray(arr)) return [] as string[];
    return arr
      .map((u) => String(u || "").trim())
      .filter((u) => /^https:\/\/.+\/analyze\//i.test(u));
  })();

  return (
    <div className="w-full min-w-0 max-w-full rounded-panel border border-border bg-card p-6 shadow-lg shadow-black/20">
      <h2 className={oc.panelTitle}>Reports</h2>
      <p className={oc.panelHint}>
        Saved reports from this local orchestrator. Deep links use the fragment{" "}
        <span className="font-mono text-muted-foreground">#report=</span> plus the report id.
      </p>
      <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Report</label>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <select
          className={oc.select + " mt-0 min-w-0 flex-1"}
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Select report</option>
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.listLabel || r.strategy || r.symbol || r.id}
            </option>
          ))}
        </select>
        <button type="button" className={oc.btnSecondary + " shrink-0"} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {cloudLinks.length > 0 ? (
        <div className="mt-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-foreground">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">All cloud analyze links</p>
          {cloudLinks.map((it) => {
            const u = String(it?.url || "").trim();
            if (!u) return null;
            return (
              <a
                key={u}
                className="block break-all font-mono text-sky-300 underline underline-offset-2 hover:text-sky-200"
                href={u}
                target="_blank"
                rel="noopener noreferrer"
              >
                {u}
              </a>
            );
          })}
        </div>
      ) : null}
      {latestAnalyzeUrls.length > 0 ? (
        <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
          {latestAnalyzeUrls.map((u) => (
            <a
              key={u}
              className="block break-all font-mono text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
              href={u}
              target="_blank"
              rel="noopener noreferrer"
            >
              {u}
            </a>
          ))}
          <span className="mt-1 block text-muted-foreground">(analyze link from latest integration run logs)</span>
        </div>
      ) : null}
      <div className="mt-6 min-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/30 p-3 md:p-4 shadow-inner shadow-black/20">
        {selectedId ? (
          <ReportSurface reportId={selectedId} mode="auto" />
        ) : (
          <p className="p-4 font-mono text-xs text-muted-foreground">No report selected.</p>
        )}
      </div>
    </div>
  );
}
