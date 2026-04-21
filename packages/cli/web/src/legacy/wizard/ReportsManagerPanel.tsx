import { ReportDetails } from "../report-view";
import type { OrchestratorAppContext } from "./useOrchestratorApp";
import { oc } from "./orchestratorUi";

type Props = { ctx: OrchestratorAppContext };

export function ReportsManagerPanel({ ctx }: Props) {
  if (ctx.orchestratorLayoutStep !== 4) return null;
  return (
    <section className={oc.panel}>
      <h2 className={oc.panelTitle}>Reports</h2>
      <p className={oc.panelHint}>Rendered report uses legacy report styles inside this panel.</p>
      <div className={oc.rowStretch}>
        <select
          className={oc.select + " min-w-0 flex-1 basis-full sm:basis-72"}
          value={ctx.selectedReportId}
          onChange={(e) => ctx.setSelectedReportId(e.target.value)}
        >
          <option value="">Select report</option>
          {ctx.reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.listLabel || r.reportName || `${r.id} | ${r.symbol || "-"} | ${r.strategy || "-"}`}
            </option>
          ))}
        </select>
        <button type="button" className={oc.btnSecondary} onClick={() => void ctx.refreshReports()}>
          Refresh Reports
        </button>
      </div>
      {ctx.cloudAnalyzeLinks.length > 0 ? (
        <div className="mt-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-foreground">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">All cloud analyze links</p>
          {ctx.cloudAnalyzeLinks.map((it) => {
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
      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-2">
        {ctx.selectedReport ? (
          <>
            {ctx.selectedReport.kiploksAnalyzeUrl &&
            /^https:\/\/(?:(?:[a-zA-Z0-9-]+\.)*kiploks\.com|localhost:3300|127\.0\.0\.1:3300|host\.docker\.internal:3300)\/analyze\//i.test(
              String(ctx.selectedReport.kiploksAnalyzeUrl).trim(),
            ) ? (
              <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
                <a
                  className="break-all font-mono text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                  href={String(ctx.selectedReport.kiploksAnalyzeUrl).trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {String(ctx.selectedReport.kiploksAnalyzeUrl).trim()}
                </a>
                <span className="ml-1 text-muted-foreground">(Kiploks Cloud)</span>
              </div>
            ) : null}
            <ReportDetails reportId={ctx.selectedReport.id} />
          </>
        ) : (
          <p className="p-4 font-mono text-xs text-muted-foreground">No report selected</p>
        )}
      </div>
    </section>
  );
}
