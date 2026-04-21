import type { OrchestratorAppContext } from "./useOrchestratorApp";
import { oc } from "./orchestratorUi";

type Props = { ctx: OrchestratorAppContext };

/** CSV workflow or integration wizard step 4: sample CSV analyze. */
export function CsvAnalyzePanel({ ctx }: Props) {
  if (!ctx.isCsvFlow && ctx.orchestratorLayoutStep !== 4) return null;
  return (
    <section className={oc.panel}>
      <h2 className={oc.panelTitle}>CSV Analyze</h2>
      <p className={oc.panelHint}>Paste a single-column profit series or similar numeric CSV sample.</p>
      <label className={oc.fieldLabel}>CSV text</label>
      <textarea className={oc.textarea} value={ctx.csvText} onChange={(e) => ctx.setCsvText(e.target.value)} />
      <div className={oc.row}>
        <button type="button" className={oc.btnPrimary} onClick={() => void ctx.runCsv()}>
          Run CSV Analyze
        </button>
      </div>
    </section>
  );
}
