/** Sub-steps inside shell step 3 (Orchestrator): 3 = target + paths only, 4 = everything else. */
export type OrchestratorLayoutStep = 3 | 4;

export function getOrchestratorLayoutStep(params: { isCsvFlow: boolean; hasPathForIntegration: boolean }): OrchestratorLayoutStep {
  if (params.isCsvFlow) return 4;
  return params.hasPathForIntegration ? 4 : 3;
}

export function orchestratorLayoutStepTitle(layoutStep: OrchestratorLayoutStep, isCsvFlow: boolean): string {
  if (isCsvFlow) return "Step 4: CSV & jobs";
  if (layoutStep === 3) return "Step 3: Target & path";
  return "Step 4: Workspace & jobs";
}

export function orchestratorLayoutProgressLine(params: {
  isCsvFlow: boolean;
  hasPreflightOk: boolean;
  hasPathForIntegration: boolean;
  hasBootstrapDone: boolean;
  canRunIntegration: boolean;
}): string {
  const { isCsvFlow, hasPreflightOk, hasPathForIntegration, hasBootstrapDone, canRunIntegration } = params;
  if (isCsvFlow) return "CSV workflow: use CSV Analyze and job panels below.";
  const step3 = hasPathForIntegration ? "complete" : "in progress";
  return (
    `Step 3 (target & path): ${step3}  |  Preflight ` +
    (hasPreflightOk ? "OK" : "pending") +
    "  |  bootstrap " +
    (hasBootstrapDone ? "OK" : "pending") +
    "  |  run " +
    (canRunIntegration ? "ready" : "pending")
  );
}
