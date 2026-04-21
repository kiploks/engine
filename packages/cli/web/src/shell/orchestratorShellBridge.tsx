import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ShellStepIndex } from "./stepMeta";

/**
 * When the shell mounts the legacy orchestrator, it pins which sub-phase is active:
 * repository (shell step 3) or workspace-activity (shell step 4).
 * workspace-integration is kept for standalone compatibility.
 */
export type OrchestratorShellPhase =
  | "repository"
  | "workspace-integration"
  | "workspace-activity";

export type OrchestratorShellBridgeValue = {
  phase: OrchestratorShellPhase;
  /** When the shell hosts the orchestrator, legacy code can jump the wizard (e.g. after Run Integration). */
  goToShellStep: ((target: ShellStepIndex) => void) | null;
};

const OrchestratorShellBridgeContext = createContext<OrchestratorShellBridgeValue | null>(null);

export function OrchestratorShellBridgeProvider({
  phase,
  goToShellStep,
  children,
}: {
  phase: OrchestratorShellPhase;
  goToShellStep?: (target: ShellStepIndex) => void;
  children: ReactNode;
}) {
  const value = useMemo<OrchestratorShellBridgeValue>(
    () => ({ phase, goToShellStep: goToShellStep ?? null }),
    [phase, goToShellStep],
  );
  return <OrchestratorShellBridgeContext.Provider value={value}>{children}</OrchestratorShellBridgeContext.Provider>;
}

export function useOrchestratorShellPhase(): OrchestratorShellPhase | null {
  return useContext(OrchestratorShellBridgeContext)?.phase ?? null;
}

export function useGoToShellStep(): ((target: ShellStepIndex) => void) | null {
  return useContext(OrchestratorShellBridgeContext)?.goToShellStep ?? null;
}
