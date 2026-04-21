import { ReportDetails } from "../../legacy/report-view";
import { mapLocalReportToLite } from "./mapLocalReportToLite";
import { ReportBlocksView } from "./ReportBlocksView";
import { ReportFullJsonPanel } from "./ReportFullJsonPanel";
import type { ReportSurfaceProps } from "./types";
import { useReportData } from "./useReportData";

const KIPLOKS_ANALYZE_PAGE_RE =
  /^https:\/\/(?:[a-zA-Z0-9-]+\.)*kiploks\.com\/analyze\/[a-zA-Z0-9_-]+\/?(?:[?#].*)?$/i;

export function ReportSurface({ reportId, mode = "auto" }: ReportSurfaceProps) {
  const { detail } = useReportData(reportId);
  const { lite } = mapLocalReportToLite(detail);
  const kiploks = detail?.kiploksAnalyzeUrl?.trim() ?? "";
  const showKiploksLink = kiploks.length > 0 && KIPLOKS_ANALYZE_PAGE_RE.test(kiploks);
  const shell = detail?.orchestratorShellUrl?.trim() ?? "";
  const showShellLink = shell.length > 0 && shell.includes("#report=");

  const kiploksBanner = showKiploksLink ? (
    <div
      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-foreground"
      role="status"
    >
      <p className="font-medium">Kiploks Cloud analyze</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Full cloud report (DQG, deployment grade, etc.). Same upload as this local summary when api_url points at kiploks.com.
      </p>
      <a
        className="mt-1 inline-block break-all font-mono text-xs text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
        href={kiploks}
        target="_blank"
        rel="noopener noreferrer"
      >
        {kiploks}
      </a>
    </div>
  ) : null;

  const shellBanner = showShellLink ? (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Local UI link: </span>
      <a
        className="break-all font-mono text-foreground underline underline-offset-2 hover:text-emerald-400"
        href={shell}
        target="_blank"
        rel="noopener noreferrer"
      >
        {shell}
      </a>
    </div>
  ) : null;

  const jsonPanel = <ReportFullJsonPanel detail={detail} />;

  if (mode === "legacy") {
    return (
      <div className="space-y-6">
        {shellBanner}
        {kiploksBanner}
        <div id="shell-report-legacy-root">
          <ReportDetails reportId={reportId} />
        </div>
        {jsonPanel}
      </div>
    );
  }

  if (mode === "blocks") {
    return (
      <div className="space-y-6">
        {shellBanner}
        {kiploksBanner}
        {lite ? (
          <ReportBlocksView lite={lite} />
        ) : (
          <p className="text-sm text-muted-foreground">No block data available.</p>
        )}
        {jsonPanel}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {shellBanner}
      {kiploksBanner}
      {lite ? (
        <ReportBlocksView lite={lite} />
      ) : (
        <p className="text-sm text-muted-foreground">Summary view is not available for this report.</p>
      )}
      {jsonPanel}
    </div>
  );
}
