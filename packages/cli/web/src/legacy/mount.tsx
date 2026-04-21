import "../legacy-global.css";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  OrchestratorShellBridgeProvider,
  type OrchestratorShellPhase,
} from "../shell/orchestratorShellBridge";
import type { ShellStepIndex } from "../shell/stepMeta";
import { App } from "./orchestrator-app";

export type MountLegacyOrchestratorOptions = {
  shellPhase: OrchestratorShellPhase;
  goToShellStep?: (target: ShellStepIndex) => void;
};

export function mountLegacyOrchestrator(container: HTMLElement, options: MountLegacyOrchestratorOptions): () => void {
  const root: Root = createRoot(container);
  root.render(
    React.createElement(
      OrchestratorShellBridgeProvider,
      { phase: options.shellPhase, goToShellStep: options.goToShellStep },
      React.createElement(App),
    ),
  );
  return () => {
    root.unmount();
  };
}
