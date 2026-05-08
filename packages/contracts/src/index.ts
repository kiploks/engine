/**
 * Public API surface for @kiploks/engine-contracts.
 * Keep these exports stable across minor releases.
 */

export const ENGINE_VERSION = "0.4.3";
export const ANALYSIS_ENGINE_VERSION = "3.0";
export const FORMULA_VERSION = "2.2.0";
export const RISK_ANALYSIS_VERSION = 1;
export const CONTRACT_VERSION = "1.0.0";
export const DEFAULT_DECIMALS = 8;

export {
  WFE_PERMUTATION_N_DEFAULT,
  WFE_PERMUTATION_N_MIN,
  WFE_PERMUTATION_N_MAX,
  WFE_PERMUTATION_P_WEAK_THRESHOLD,
} from "./wfePermutation";

export type CanonicalScaledNumber = {
  v: string;
  scale: number;
};

export type {
  TradeInput,
  Trade,
  AnalyzeInput,
  AnalysisSummary,
  ReproducibilityMetadata,
  AnalyzeOutput,
  AnalyzeConfig,
} from "./analyzeContract";

export type {
  KiploksErrorCode,
  KiploksUnavailableReason,
  KiploksWarningCode,
  BlockResult,
  KiploksWarning,
} from "./errors";
export { KiploksValidationError } from "./errors";

export type {
  EquityPoint,
  WindowConfig,
  WindowMetrics,
  WFAWindow,
  TradeBasedWFAInput,
  PrecomputedWFAInput,
  WFEResult,
  ConsistencyResult,
  ParameterStabilityResult,
  BenchmarkResult,
  NarrativeResult,
  DQGResult,
  KillSwitchResult,
  WFAAnalysisOutput,
} from "./wfaAnalysisContract";
export { WFA_PUBLIC_ANALYSIS_SCHEMA_VERSION } from "./wfaAnalysisContract";

// --- Robustness Score from WFA (open core candidate) ---

export type RobustnessBlockedByModule = "validation" | "risk" | "stability" | "execution";

export type RobustnessScoreFromWfaInput = {
  backtestResult?: { results?: Record<string, unknown> } | null;
  walkForwardAnalysis:
    | {
        stabilityScore?: number | null;
        wfe?: number | null;
        consistency?: number | null;
        overfittingScore?: number | null;
        periods?: Array<{
          optimizationReturn?: number;
          validationReturn?: number;
        }>;
        performanceTransfer?: {
          windows?: Array<{
            oosEquityCurve?: Array<{ date?: string; value?: number; equity?: number }>;
          }>;
        };
        failedWindows?: { count?: number; total?: number };
      }
    | null
    | undefined;
  monteCarloAnalysis?: unknown;
  proBenchmarkMetrics?: Record<string, unknown> | null;
  riskAnalysis?: Record<string, unknown> | null;
  parameterSensitivity?: Record<string, unknown> | null;
  turnoverAndCostDrag?: Record<string, unknown> | null;
};

export type RobustnessScoreFromWfaResult = {
  overall: number;
  potentialOverall?: number;
  components: {
    parameterStability: number;
    timeRobustness: number;
    marketRegime: number;
    monteCarloStability: number;
    sensitivity: number;
    dataQuality?: number;
  };
  modules: {
    validation: number;
    risk: number;
    stability: number;
    execution: number;
  };
  blockedByModule?: RobustnessBlockedByModule;
  blockedByModules?: RobustnessBlockedByModule[];
  wfeNote?: string;
  stabilityNotComputed?: boolean;
};

// --- Walk Forward Analysis: Professional WFA (open core candidate) ---

export type WfaProfessionalCurvePointInput = {
  date?: string;
  timestamp?: number | string;
  t?: number | string;
  value?: number;
  balance?: number;
  equity?: number;
};

export type WfaProfessionalPerformanceTransferWindowInput = {
  oosEquityCurve?: WfaProfessionalCurvePointInput[];
  equityCurve?: WfaProfessionalCurvePointInput[];
  curve?: WfaProfessionalCurvePointInput[];
};

export type WfaProfessionalPerformanceTransferInput = {
  windows?: WfaProfessionalPerformanceTransferWindowInput[];
};

export type WfaProfessionalPeriodInput = {
  optimizationReturn?: number;
  validationReturn?: number;
  optimization_return?: number;
  validation_return?: number;
  parameters?: Record<string, number>;
  params?: Record<string, number>;
  optimization_params?: Record<string, number>;
  optimized_params?: Record<string, number>;
  validationMaxDD?: number;
  metrics?: {
    optimization?: { totalReturn?: number; total?: number };
    validation?: { totalReturn?: number; total?: number };
  };
};

export type WfaProfessionalInput = {
  periods?: WfaProfessionalPeriodInput[];
  windows?: WfaProfessionalPeriodInput[];
  performanceTransfer?: WfaProfessionalPerformanceTransferInput;
  /** Integration WFA verdict; used with `failedWindows` for submit-time grade guard. */
  verdict?: string;
  failedWindows?: { count?: number; total?: number };
};

export type WfaProfessionalOptions = {
  seed?: number;
  permutationN?: number;
  bootstrapN?: number;
  monteCarloMode?: "legacy" | "auto" | "new_only";
  enablePathMc?: boolean;
  pathSimulations?: number;
  maxEquityPoints?: number;
  cpuBudgetMs?: number;
};

export type {
  InstitutionalGradeOverride,
  InstitutionalGradeOverrideCode,
} from "./institutionalGradeOverride";

export type {
  DistributionStats,
  MonteCarloPercentileSet,
  PathMonteCarloBlock,
  PathMonteCarloEquityPoint,
  PathMonteCarloMeta,
  PathMonteCarloOptions,
  PathMonteCarloResult,
  PathStability,
  TailRisk,
} from "./pathMonteCarlo";

export type { IntegrationPayloadRaw, UnifiedIntegrationPayload } from "./unifiedPayload";
export type {
  RobustnessScoreTextPayload,
  RobustnessScore,
  WalkForwardAnalysisTextPayload,
  ProfessionalMonteCarloMethod,
  ProfessionalMonteCarloReasonCode,
  ProfessionalMonteCarloValidation,
  ProfessionalWfa,
  ProfessionalMeta,
  WalkForwardAnalysis,
  TestResultData,
} from "./testResultData";
