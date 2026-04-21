import type { PreflightState } from "../legacy/types";
import { oc } from "../legacy/wizard/orchestratorUi";
import { PreflightSummary } from "./PreflightSummary";
import type { ShellStepIndex } from "./stepMeta";
import { SHELL_STEPS } from "./stepMeta";

type Props = {
  step: ShellStepIndex;
  step0Ack: boolean;
  onStep0AckChange: (ack: boolean) => void;
  preflightSnapshot: PreflightState | null;
  preflightLoading: boolean;
  onRunPreflight: () => void;
};

/** Body for shell steps 0 (Overview) and 1 (Preparation) only. */
export function ShellStepMainCard({
  step,
  step0Ack,
  onStep0AckChange,
  preflightSnapshot,
  preflightLoading,
  onRunPreflight,
}: Props) {
  const meta = SHELL_STEPS[step];
  if (!meta || step >= 2) return null;

  const cardPad = step === 1 ? "p-4" : "p-6";
  const cardShadow = step === 1 ? "shadow-md shadow-black/15" : "shadow-lg shadow-black/20";

  return (
    <div
      className={`w-full min-w-0 max-w-full rounded-panel border border-border bg-card ${cardPad} ${cardShadow}`}
    >
      <h2 className="text-lg font-semibold text-foreground">{meta.title}</h2>
      <p
        className={
          step === 1
            ? "mt-2 break-words text-base leading-snug text-muted-foreground"
            : "mt-3 break-words text-base leading-relaxed text-muted-foreground"
        }
      >
        {meta.hint}
      </p>
      {step === 0 ? (
        <>
          <div className="mt-5 rounded-lg border border-border bg-secondary p-4">
            <h3 className="text-base font-semibold text-foreground">What this setup does</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              This wizard takes you from environment checks to a full local strategy run and final report review.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base text-muted-foreground">
              <li>Validate prerequisites (Python, Docker, Node).</li>
              <li>Register the integration repository path.</li>
              <li>Run bootstrap and integration execution.</li>
              <li>Inspect active integration logs and open the final report in Step 5.</li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Why: to quickly confirm your local integration is correctly configured and producing valid analysis output.
            </p>
          </div>
          <label className="mt-5 flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary p-3 text-base text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
              checked={step0Ack}
              onChange={(e) => onStep0AckChange(e.target.checked)}
            />
            <span className="min-w-0 break-words">
              Understood. Continue to environment checks and integration setup.
            </span>
          </label>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <div className={`${oc.row} mt-4`}>
            <button
              type="button"
              className={oc.btnPrimary}
              disabled={preflightLoading}
              onClick={onRunPreflight}
            >
              Run Preflight
            </button>
          </div>
          {preflightSnapshot ? (
            <PreflightSummary state={preflightSnapshot} />
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No run yet. Results appear below after Preflight.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
