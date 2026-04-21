import { useOrchestratorShellPhase } from "../../shell/orchestratorShellBridge";
import { CsvAnalyzePanel } from "./CsvAnalyzePanel";
import { IntegrationJobLogsPanel } from "./IntegrationJobLogsPanel";
import { KiploksWorkspacePanel } from "./KiploksWorkspacePanel";
import { oc } from "./orchestratorUi";
import { ReportsManagerPanel } from "./ReportsManagerPanel";
import { useOrchestratorApp } from "./useOrchestratorApp";
import { WizardHeaderSection } from "./WizardHeaderSection";

export function OrchestratorAppView() {
  const ctx = useOrchestratorApp();
  const shellPhase = useOrchestratorShellPhase();
  const step4 = ctx.orchestratorLayoutStep === 4;

  const hideOrchestratorHeader =
    shellPhase === "workspace-integration" || shellPhase === "workspace-activity";

  return (
    <div className={oc.root + " " + oc.stack}>
      {!hideOrchestratorHeader ? <WizardHeaderSection ctx={ctx} /> : null}

      {step4 ? (
        <>
          {!ctx.isCsvFlow ? <KiploksWorkspacePanel ctx={ctx} /> : null}
          {ctx.isCsvFlow && shellPhase === "workspace-integration" ? <CsvAnalyzePanel ctx={ctx} /> : null}
          {ctx.isCsvFlow && (shellPhase === "workspace-activity" || shellPhase === null) ? (
            <>
              <CsvAnalyzePanel ctx={ctx} />
              {shellPhase === null ? <ReportsManagerPanel ctx={ctx} /> : null}
            </>
          ) : null}
          {!ctx.isCsvFlow && (shellPhase === "workspace-activity" || shellPhase === null) ? (
            <>
              <IntegrationJobLogsPanel ctx={ctx} />
              {shellPhase === null ? <ReportsManagerPanel ctx={ctx} /> : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
