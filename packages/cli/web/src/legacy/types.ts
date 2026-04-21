export type WorkflowIntegration = "freqtrade" | "octobot";

export interface UiJob {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  logs?: string[];
  result?: { integration?: string; [key: string]: unknown };
}

export interface UiPathRow {
  integration: string;
  displayPath?: string;
  canonicalPath?: string;
  updatedAt?: string;
}

export interface UiReportRow {
  id: string;
  reportName?: string | null;
  symbol?: string | null;
  strategy?: string | null;
  kiploksAnalyzeUrl?: string | null;
  orchestratorShellUrl?: string | null;
  listLabel?: string;
  reportKind?: string;
  verdict?: string | null;
  batchIndex?: number | null;
  batchTotal?: number | null;
}

export interface UiBacktestArtifact {
  artifactKey: string;
  sourceFile?: string;
  runIndex?: number;
  strategy?: string;
  symbol?: string;
  startDate?: string;
  endDate?: string;
  profitTotalPct?: number;
}

export interface PreflightState {
  python?: { ok?: boolean; [key: string]: unknown };
  docker?: { ok?: boolean; [key: string]: unknown };
  node?: { ok?: boolean; version?: string; [key: string]: unknown };
  checkedAt?: string;
  [key: string]: unknown;
}

export interface KiploksUiState {
  apiTarget: string;
  localApiBaseUrl?: string;
  localApiDockerBaseUrl?: string;
  config: Record<string, unknown>;
}
