import type { WorkflowType } from "../workflow";
import type { OrchestratorAppContext } from "./useOrchestratorApp";
import { oc } from "./orchestratorUi";

type Props = { ctx: OrchestratorAppContext };

export function WizardHeaderSection({ ctx }: Props) {
  const isBusyStatus = /running|submitting|opening|cancelling|saving|removing|loading/i.test(ctx.status);
  const milestoneStatus = [
    ctx.hasPathForIntegration ? "Path registered" : null,
    ctx.hasBootstrapDone ? "Bootstrap done" : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const displayStatus = isBusyStatus ? ctx.status : milestoneStatus || ctx.status;
  const busy = /running|submitting|opening|cancelling|saving|removing|loading/i.test(displayStatus);
  const canRegisterPath = ctx.repoPath.trim().length > 0;
  return (
    <section className={oc.panel}>
      <div className="min-w-0">
          <p className={oc.badge}>Workspace</p>
          <h2 className={"mt-2 " + oc.panelTitle}>Workspace setup</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Pick a source type (bots or custom CSV), run Preflight on Preparation, register a path and run bootstrap in
            Step 3, then continue to kiploks and jobs. We use open-source integrations from{" "}
            <a
              href="https://github.com/kiploks/kiploks-freqtrade"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline decoration-primary/60 underline-offset-2 hover:decoration-primary"
            >
              kiploks-freqtrade
            </a>{" "}
            and{" "}
            <a
              href="https://github.com/kiploks/kiploks-octobot"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline decoration-primary/60 underline-offset-2 hover:decoration-primary"
            >
              kiploks-octobot
            </a>
            .
          </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={oc.fieldLabel}>Source type</label>
          <select
            className={oc.select}
            value={ctx.workflowType}
            onChange={(e) => ctx.setWorkflowType(e.target.value as WorkflowType)}
          >
            <option value="csv">csv</option>
            <option value="freqtrade">freqtrade</option>
            <option value="octobot">octobot</option>
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <p className={"mt-1 text-base font-medium " + (busy ? oc.statusBusy : oc.statusReady)}>{displayStatus}</p>
        </div>
      </div>

      {!ctx.isCsvFlow && ctx.orchestratorLayoutStep === 3 ? (
        <div className="mt-5">
          <label className={oc.fieldLabel}>Repository path</label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <input
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/40"
              value={ctx.repoPath}
              onChange={(e) => ctx.setRepoPath(e.target.value)}
              placeholder="/absolute/path/to/repo"
            />
            <button
              type="button"
              className={
                "inline-flex h-9 mt-0 w-auto shrink-0 items-center justify-center rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              }
              onClick={() => void ctx.pickPath()}
            >
              Choose Folder
            </button>
          </div>
          <label className={oc.fieldLabel}>Bootstrap mode</label>
          <select className={oc.select} value={ctx.bootstrapMode} onChange={(e) => ctx.setBootstrapMode(e.target.value)}>
            <option value="safe-merge">safe-merge - recommended: keep your files, update only managed Kiploks parts</option>
            <option value="replace-managed">replace-managed - reset managed Kiploks files from template if setup is broken</option>
          </select>
          <div className={oc.row}>
            <button
              type="button"
              className={oc.btnPrimary + " w-auto shrink-0"}
              disabled={!canRegisterPath}
              onClick={() => void ctx.registerPathAndBootstrap()}
            >
              Register + Bootstrap
            </button>
            <button
              type="button"
              className={oc.btnSecondary + " w-auto shrink-0" + (ctx.hasPathForIntegration ? "" : " invisible pointer-events-none")}
              tabIndex={ctx.hasPathForIntegration ? 0 : -1}
              aria-hidden={!ctx.hasPathForIntegration}
              onClick={() => void ctx.removePath(ctx.integration)}
            >
              Remove {ctx.integration}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
