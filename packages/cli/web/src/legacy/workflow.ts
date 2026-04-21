export const WORKFLOW_KEY = "kiploks_ui_workflow";

export type WorkflowType = "csv" | "freqtrade" | "octobot";

export function readInitialWorkflow(): WorkflowType {
  try {
    const v = window.localStorage.getItem(WORKFLOW_KEY);
    if (v === "csv" || v === "freqtrade" || v === "octobot") return v;
  } catch {
    /* ignore */
  }
  return "freqtrade";
}
