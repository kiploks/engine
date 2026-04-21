import { ApiErrorBanner } from "./ApiErrorBanner";
import { ShellReportsStep } from "./shell/ShellReportsStep";
import { ShellStepMainCard } from "./shell/ShellStepMainCard";
import { ShellWizardFooter } from "./shell/ShellWizardFooter";
import { StepShellLayout } from "./shell/StepShellLayout";
import { useShellWizard } from "./shell/useShellWizard";

export default function App() {
  const {
    step,
    maxReachedStep,
    preflightError,
    preflightSnapshot,
    loading,
    step0Ack,
    setStep0Ack,
    preparationGateOk,
    bootstrapGateOk,
    integrationRunGateOk,
    legacyHost,
    runPreflightProbe,
    onContinue,
    onBack,
    goToStep,
  } = useShellWizard();

  return (
    <StepShellLayout
      step={step}
      maxReachedStep={maxReachedStep}
      loading={loading}
      onStepSelect={goToStep}
      footer={
        <ShellWizardFooter
          step={step}
          loading={loading}
          step0Ack={step0Ack}
          preparationGateOk={preparationGateOk}
          bootstrapGateOk={bootstrapGateOk}
          integrationRunGateOk={integrationRunGateOk}
          onContinue={onContinue}
          onBack={onBack}
        />
      }
    >
      {preflightError ? (
        <div className="mb-6">
          <ApiErrorBanner {...preflightError} />
        </div>
      ) : null}

      {step < 2 ? (
        <ShellStepMainCard
          step={step}
          step0Ack={step0Ack}
          onStep0AckChange={setStep0Ack}
          preflightSnapshot={preflightSnapshot}
          preflightLoading={loading}
          onRunPreflight={() => void runPreflightProbe()}
        />
      ) : null}

      {step >= 2 && step <= 3 ? (
        <div
          ref={legacyHost}
          className="overflow-auto rounded-panel border border-border bg-card p-4 shadow-inner shadow-black/20 md:p-6"
        />
      ) : null}

      {step === 4 ? <ShellReportsStep /> : null}
    </StepShellLayout>
  );
}
