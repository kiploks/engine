export type ReportSurfaceMode = "auto" | "blocks" | "legacy";

export type ReportSurfaceProps = {
  reportId: string;
  mode?: ReportSurfaceMode;
};

export type LocalReportDetails = {
  id: string;
  createdAt?: string;
  source?: string;
  symbol?: string | null;
  strategy?: string | null;
  reportKind?: "demo" | "integration";
  batchIndex?: number | null;
  batchTotal?: number | null;
  /** Kiploks Cloud full analyze page when this run was uploaded there. */
  kiploksAnalyzeUrl?: string | null;
  /** Local orchestrator /ui/#report= deep link (same machine). */
  orchestratorShellUrl?: string | null;
  report?: unknown;
  rawPayload?: unknown;
};

export type TestResultDataLite = {
  strategy?: {
    name?: string;
    symbol?: string;
    timeframe?: string;
    exchange?: string;
  };
  decisionSummary?: {
    verdict?: string;
    confidence?: number;
    riskLevel?: string;
    deploymentReadiness?: boolean;
  };
  verdictPayload?: Record<string, unknown> | null;
  robustnessScore?: {
    overall?: number;
    components?: {
      parameterStability?: number;
      timeRobustness?: number;
      marketRegime?: number;
      monteCarloStability?: number;
      sensitivity?: number;
    };
    modules?: Record<string, number>;
  } | null;
  dataQualityGuardResult?: Record<string, unknown> | null;
  benchmarkComparison?: Record<string, unknown> | null;
  proBenchmarkMetrics?: Record<string, unknown> | null;
  walkForwardAnalysis?: Record<string, unknown> | null;
  parameterSensitivity?: Record<string, unknown> | null;
  turnoverAndCostDrag?: Record<string, unknown> | null;
  riskAnalysis?: Record<string, unknown> | null;
  strategyActionPlan?: Record<string, unknown> | null;
  monteCarloSimulation?: Record<string, unknown> | null;
  monteCarloValidation?: Record<string, unknown> | null;
  decisionLogic?: {
    verdict?: string;
    rules?: Array<{ name?: string; condition?: string; passed?: boolean }>;
    modifiers?: Array<{ type?: string; description?: string; value?: string }>;
    auditNote?: string;
  } | null;
};
