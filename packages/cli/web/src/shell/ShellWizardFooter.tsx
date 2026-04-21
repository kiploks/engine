import type { ShellStepIndex } from "./stepMeta";

type Props = {
  step: ShellStepIndex;
  loading: boolean;
  step0Ack: boolean;
  preparationGateOk: boolean;
  bootstrapGateOk: boolean;
  integrationRunGateOk: boolean;
  onContinue: () => void;
  onBack: () => void;
};

export function ShellWizardFooter({
  step,
  loading,
  step0Ack,
  preparationGateOk,
  bootstrapGateOk,
  integrationRunGateOk,
  onContinue,
  onBack,
}: Props) {
  const atLast = step >= 4;
  const nextDisabled =
    loading ||
    atLast ||
    (step === 0 && !step0Ack) ||
    (step === 1 && !preparationGateOk) ||
    (step === 2 && !bootstrapGateOk) ||
    (step === 3 && !integrationRunGateOk);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-panel bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={nextDisabled}
        onClick={() => void onContinue()}
      >
        {loading ? "Checking..." : atLast ? "Done" : "Next"}
      </button>
      <button
        type="button"
        className="rounded-panel border border-border bg-card px-5 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-40"
        disabled={step === 0 || loading}
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}
