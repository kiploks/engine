import type { OrchestratorAppContext } from "./useOrchestratorApp";
import { oc } from "./orchestratorUi";

type Props = { ctx: OrchestratorAppContext };

/** Integration wizard step 2: register repository path. */
export function StepPathPanel({ ctx }: Props) {
  if (ctx.isCsvFlow || ctx.orchestratorLayoutStep !== 3) return null;
  return (
    <section className={oc.panel}>
      <h2 className={oc.panelTitle}>Paths</h2>
      <p className={oc.panelHint}>Point the orchestrator at your integration repository on disk.</p>
      <label className={oc.fieldLabel}>Repository path</label>
      <input
        className={oc.input}
        value={ctx.repoPath}
        onChange={(e) => ctx.setRepoPath(e.target.value)}
        placeholder="/absolute/path/to/repo"
      />
      <div className={oc.row}>
        <button type="button" className={oc.btnSecondary} onClick={() => void ctx.pickPath()}>
          Choose Folder
        </button>
        <button type="button" className={oc.btnPrimary} onClick={() => void ctx.registerPath()}>
          Register Path
        </button>
      </div>
      <p
        className={
          "mt-3 text-sm font-medium leading-6 " +
          (ctx.hasPathForIntegration ? "text-emerald-400" : "text-transparent select-none")
        }
        aria-hidden={!ctx.hasPathForIntegration}
      >
        Path registered
      </p>
      <div className={oc.row + " mt-3 min-h-[2.5rem] items-center"}>
        <button
          type="button"
          className={oc.btnSecondary + (ctx.hasPathForIntegration ? "" : " invisible pointer-events-none")}
          tabIndex={ctx.hasPathForIntegration ? 0 : -1}
          aria-hidden={!ctx.hasPathForIntegration}
          onClick={() => void ctx.removePath(ctx.integration)}
        >
          Remove {ctx.integration}
        </button>
      </div>
    </section>
  );
}
