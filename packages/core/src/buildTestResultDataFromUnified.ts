/**
 * Build TestResultData from standalone integration payload.
 * No mock fallbacks: missing data is exposed as null or "n/a". If symbol is missing, returns null (do not run analysis).
 * Turnover/cost drag (`buildTurnoverAndCostDrag`), benchmark math, and most report formulas live in
 * @kiploks/engine-core. This module orchestrates payload parsing, DQG, verdict, and assembly. Add new formulas in core first.
 */

import {
  buildDiagnosticsFromWfa,
  computeAuditVerdictFromParameters,
  type WfaDiagnosticsLike,
} from "./buildDiagnosticsFromWfa";
import type { DQGModuleResult } from "./dataQualityGuard";
import {
  computeGapDensityFromRaw,
  computePriceIntegrityFromRaw,
  getInvestabilityGrade,
  runDataQualityGuard,
} from "./dataQualityGuard";
import { computeFinalVerdict } from "./finalVerdictEngine";
import { runIntegrityJudge } from "./integrity";
import type { MetricDefinitionForApi } from "./metricDefinitionContract";
import { toMetricDefinitionForApi } from "./metricDefinitionContract";
import {
  computeOOSRetention,
  computePerformanceDegradation,
  computeWFEMetric_v2,
  OOS_CALMAR_METRIC_DEFINITION,
  OOS_CVAR95_METRIC_DEFINITION,
  OOS_DOMINANCE_RATIO_METRIC_DEFINITION,
  WFA_PASS_PROBABILITY_METRIC_DEFINITION,
} from "./layer25";
import { evaluateKillSwitch } from "./killSwitch";
import { normalizeTradesForTurnover } from "./normalizeTrades";
import {
  getCopyContract,
  METHODOLOGY_NOTE,
  RISK_CLASS_THRESHOLDS,
  SENSITIVITY_PRECISION,
  PENALTY_THRESHOLD,
  STABLE_THRESHOLD,
} from "./parameterSensitivityContract";
import {
  buildTrialsFromWfa,
  computeParameterSensitivityFromTrials,
} from "./parameterSensitivity";
import {
  aggregateOOSFromWFAWindows,
  buildRiskBlockFromOOSMetrics,
  buildWFAWindowMetrics,
  computeFullBacktestMetrics,
  computeOOSMetricsFromTrades,
  mapPayloadRiskToOOSMetrics,
  wfaRowsForMetrics,
} from "./canonicalMetrics";
import {
  computeProBenchmarkFromBacktest,
  fillProMetricsFromWfaPeriods,
} from "./proBenchmarkMetrics";
import { buildCanonicalR } from "./riskCore";
import { riskBuilderFromR } from "./riskAnalysis";
import { buildStrategyActionPlanPrecomputed } from "./strategyActionPlanPrecomputed";
import {
  calculateRobustnessScore,
  computeWfaVerdict,
  createEmptyWalkForwardAnalysis,
  transformToWalkForwardAnalysis,
} from "./transformers";
import { buildDecisionArtifacts } from "./decisionArtifacts";
import { computeInstitutionalReadiness } from "./executionGrade";
import { buildTurnoverAndCostDrag } from "./turnoverAndCostDrag";
import type { UnifiedIntegrationPayload } from "@kiploks/engine-contracts";
import type { TestResultDataLike } from "./analysisReportTypes";
import type { TestResultData } from "./testResultData";
import { buildWhatIfScenarios } from "./whatIfScenarios";
import { MIN_TRADES_FOR_SIGNIFICANCE } from "./constants";
import { toDecimalReturn } from "./normalize";
import { engineInfo, engineWarn } from "./logger";

const NA = "n/a";

/** Minimum days for full Data Quality Guard pass. Below this, robustness score is forced to Fail. */
const DATA_QUALITY_MIN_DAYS = 365;

/** True if value looks like ParameterSensitivity (from integration payload). Accepts parameters[] (optional, can be empty) or diagnostics. */
function validParameterSensitivity(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ps = value as Record<string, unknown>;
  const params = ps.parameters;
  const diagnostics = ps.diagnostics;
  if (Array.isArray(params) && params.length > 0) {
    const first = params[0] as Record<string, unknown>;
    const hasImpact =
      first.impact === "high" ||
      first.impact === "medium" ||
      first.impact === "low";
    if (
      typeof first.name === "string" &&
      typeof first.sensitivity === "number" &&
      typeof first.bestValue === "number" &&
      typeof first.worstValue === "number" &&
      (first.impact === undefined || hasImpact)
    )
      return true;
  }
  if (
    diagnostics != null &&
    typeof diagnostics === "object" &&
    !Array.isArray(diagnostics)
  )
    return true;
  return false;
}

/** True if value looks like BenchmarkComparison (from integration payload, e.g. kiploks-freqtrade). */
function validBenchmarkComparison(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.strategyCAGR === "number" &&
    typeof b.btcCAGR === "number" &&
    typeof b.excessReturn === "number" &&
    Array.isArray(b.interpretation)
  );
}

function parseDateToDays(startStr: string, endStr: string): number | null {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr.slice(0, 10));
  const end = new Date(endStr.slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return days >= 0 ? days : null;
}

function normalizeSymbol(s: string): string {
  if (!s || typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  if (t.includes("/")) return t;
  const upper = t.toUpperCase();
  if (upper.endsWith("USDT") && upper.length > 4) {
    return `${upper.slice(0, -4)}/USDT`;
  }
  return t;
}

/** Leave null for missing or non-finite values so UI can show n/a instead of fake 0. */
function normalizeBacktestResults(
  results: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!results || typeof results !== "object") return results;
  const r = { ...results };
  const keys: (keyof typeof r)[] = [
    "sharpeRatio",
    "profitFactor",
    "maxDrawdown",
    "totalReturn",
    "winRate",
    "totalTrades",
  ];
  for (const k of keys) {
    if (r[k] === null || r[k] === undefined) continue;
    if (typeof r[k] === "number" && !Number.isFinite(r[k] as number))
      r[k] = null;
  }
  return r;
}

export interface BuildTestResultDataOptions {
}

/** Replace NaN with undefined (or 0 for required numbers) in report fields validated by testResultDataSchema so Zod parse does not fail. */
function sanitizeReportNumbersForJudge(report: TestResultData): void {
  const opt = (o: Record<string, unknown> | undefined, k: string) => {
    if (o && typeof o[k] === "number" && !Number.isFinite(o[k] as number)) o[k] = undefined;
  };
  const res = report.results as Record<string, unknown> | undefined;
  if (res) {
    opt(res, "totalTrades");
    opt(res, "totalReturn");
  }
  const pro = report.proBenchmarkMetrics as Record<string, unknown> | undefined;
  if (pro) {
    for (const k of ["oosRetention", "optimizationGain", "sumIs", "sumOos", "wfaPassProbability"]) opt(pro, k);
    const wfeDist = pro.wfeDistribution as Record<string, unknown> | undefined;
    if (wfeDist && typeof wfeDist.median === "number" && !Number.isFinite(wfeDist.median as number)) wfeDist.median = undefined;
  }
  const wfa = report.walkForwardAnalysis as unknown as Record<string, unknown> | undefined;
  if (wfa) {
    opt(wfa, "wfe");
    const fw = wfa.failedWindows as { count?: number; total?: number } | undefined;
    if (fw) {
      if (typeof fw.count === "number" && !Number.isFinite(fw.count)) fw.count = 0;
      if (typeof fw.total === "number" && !Number.isFinite(fw.total)) fw.total = 0;
    }
  }
  const bc = report.benchmarkComparison as Record<string, unknown> | undefined;
  if (bc) {
    opt(bc, "netEdgeBps");
    opt(bc, "strategyCAGR");
  }
  const risk = report.riskAnalysis as Record<string, unknown> | undefined;
  if (risk) opt(risk, "maxDrawdown");
  const rob = report.robustnessScore as unknown as Record<string, unknown> | undefined;
  if (rob) opt(rob, "overall");
}

/**
 * @param unifiedPayload - Zone A normalized payload (use mapPayloadToUnified on raw JSON first).
 * @param resultId - DB result id (test.id). Required so WFA can be resolved; script payload usually has no "id".
 * @param options - reserved for future use.
 * @returns TestResultData or null if symbol is missing (analysis is not run).
 */
export function buildTestResultDataFromUnified(
  unifiedPayload: UnifiedIntegrationPayload,
  resultId?: string,
  options: BuildTestResultDataOptions = {},
): TestResultData | null {
  const effectiveId = resultId ?? (unifiedPayload.id as string) ?? "";
  const strategy = (unifiedPayload.strategy as Record<string, unknown>) ?? {};
  const backtestRaw = (unifiedPayload.backtestResult ?? unifiedPayload.backtest) as
    | Record<string, unknown>
    | undefined;
  const resultsRaw = (backtestRaw?.results ?? backtestRaw) as
    | Record<string, unknown>
    | undefined;
  const results = normalizeBacktestResults(resultsRaw);
  const backtest =
    backtestRaw && results ? { ...backtestRaw, results } : backtestRaw;
  const params = (unifiedPayload.parameters ?? strategy.parameters ?? {}) as Record<
    string,
    unknown
  >;
  const backtestConfig = (backtest?.config ?? {}) as Record<string, unknown>;
  const strategyParamsFromConfig = (backtestConfig.strategy_params ??
    backtestConfig.strategy_params) as Record<string, unknown> | undefined;
  const paramKeys =
    typeof params === "object" && !Array.isArray(params)
      ? Object.keys(params).filter((k) => k !== "strategy")
      : [];
  const paramsCount =
    paramKeys.length > 0
      ? paramKeys.length
      : typeof strategyParamsFromConfig === "object" &&
          strategyParamsFromConfig !== null &&
          !Array.isArray(strategyParamsFromConfig)
        ? Object.keys(strategyParamsFromConfig).length
        : 0;
  const wfaRaw =
    unifiedPayload.walkForwardAnalysis ?? unifiedPayload.wfaData ?? unifiedPayload.wfaResult;

  const config = backtestConfig;
  let dateFromPayload = (unifiedPayload.dateFrom ??
    backtest?.dateFrom ??
    config.startDate ??
    "") as string;
  let dateToPayload = (unifiedPayload.dateTo ??
    backtest?.dateTo ??
    config.endDate ??
    "") as string;

  // Fallback: backtest results (e.g. Freqtrade backtest_start/backtest_end)
  if (
    (!dateFromPayload || !dateToPayload) &&
    backtest &&
    typeof backtest === "object"
  ) {
    const results = (backtest as Record<string, unknown>).results as
      | Record<string, unknown>
      | undefined;
    if (results && typeof results === "object") {
      const start = (results.backtest_start ??
        results.start_date ??
        results.startDate) as string | undefined;
      const end = (results.backtest_end ??
        results.end_date ??
        results.endDate) as string | undefined;
      if (start && typeof start === "string" && !dateFromPayload)
        dateFromPayload = start.slice(0, 10);
      if (end && typeof end === "string" && !dateToPayload)
        dateToPayload = end.slice(0, 10);
    }
  }
  // Fallback: derive date range from WFA periods so Data Quality Guard can be computed
  if (
    (!dateFromPayload || !dateToPayload) &&
    wfaRaw &&
    typeof wfaRaw === "object"
  ) {
    const wfaObj = wfaRaw as Record<string, unknown>;
    const periods = (wfaObj.periods ?? wfaObj.windows) as
      | Array<{
          startDate?: string;
          endDate?: string;
          start?: string;
          end?: string;
        }>
      | undefined;
    if (Array.isArray(periods) && periods.length > 0) {
      const starts = periods
        .map((p) => p.startDate ?? p.start ?? "")
        .filter(Boolean);
      const ends = periods.map((p) => p.endDate ?? p.end ?? "").filter(Boolean);
      if (!dateFromPayload && starts.length)
        dateFromPayload = (starts[0] as string).slice(0, 10);
      if (!dateToPayload && ends.length)
        dateToPayload = (ends[ends.length - 1] as string).slice(0, 10);
    }
    const perfTransfer = wfaObj.performanceTransfer as
      | {
          windows?: Array<{
            startDate?: string;
            endDate?: string;
            start?: string;
            end?: string;
          }>;
        }
      | undefined;
    if (
      (!dateFromPayload || !dateToPayload) &&
      Array.isArray(perfTransfer?.windows) &&
      perfTransfer.windows.length > 0
    ) {
      const wStarts = perfTransfer.windows
        .map((w) => w.startDate ?? w.start ?? "")
        .filter(Boolean);
      const wEnds = perfTransfer.windows
        .map((w) => w.endDate ?? w.end ?? "")
        .filter(Boolean);
      if (!dateFromPayload && wStarts.length)
        dateFromPayload = (wStarts[0] as string).slice(0, 10);
      if (!dateToPayload && wEnds.length)
        dateToPayload = (wEnds[wEnds.length - 1] as string).slice(0, 10);
    }
  }

  const symbolRaw = (results?.symbol ??
    backtest?.symbol ??
    strategy.symbol ??
    config?.symbol ??
    "") as string;
  const symbol = normalizeSymbol(symbolRaw);
  if (!symbol) {
    engineWarn(
      "[buildTestResultData] DATA LOSS: returning null - symbol missing or invalid. symbolRaw=%s payloadKeys=%s",
      symbolRaw || "(empty)",
      Object.keys(unifiedPayload).join(","),
    );
    return null;
  }

  let wfa: ReturnType<typeof transformToWalkForwardAnalysis> = null;
  let robustnessScore: ReturnType<typeof calculateRobustnessScore> = null;

  if (wfaRaw && typeof wfaRaw === "object") {
    const synthetic = {
      id: effectiveId,
      strategyId: (unifiedPayload.strategyId ?? strategy.id ?? "") as string,
      startDate: dateFromPayload,
      endDate: dateToPayload,
      results: {
        topResults: [
          {
            id: effectiveId,
            walkForwardAnalysis: wfaRaw,
            wfaData: wfaRaw,
            wfaResult: wfaRaw,
            backtestResult: backtest,
            riskAnalysis: unifiedPayload.riskAnalysis,
            proBenchmarkMetrics: null,
            parameterSensitivity: null,
            turnoverAndCostDrag: null,
          },
        ],
      },
    };
    wfa = transformToWalkForwardAnalysis(
      synthetic as Parameters<typeof transformToWalkForwardAnalysis>[0],
      effectiveId,
    );
  }

  const strategyName =
    (strategy.name as string) ??
    (typeof params.strategy === "string" ? params.strategy : "") ??
    "";
  const timeframeStr =
    (strategy.timeframe as string) ?? (config?.timeframe as string) ?? "";

  const wfaWindowsCount = wfa?.windows?.length ?? 0;

  const totalTradesForSignificance =
    typeof (results as Record<string, unknown>)?.totalTrades === "number"
      ? (results as { totalTrades: number }).totalTrades
      : typeof (results as Record<string, unknown>)?.total_trades === "number"
        ? (results as { total_trades: number }).total_trades
        : undefined;

  // Single source (BENCH_SINGLE_SOURCE_AUDIT): build wfaWindowMetrics once; when >= 2 windows, Layer 2.5 fills WFE/retention/degradation, so fillProMetricsFromWfaPeriods must not set them.
  const wfaRawObj = wfaRaw as Record<string, unknown> | null | undefined;
  const wfaWindowMetrics = buildWFAWindowMetrics(wfaRawObj);

  // Full pro benchmark metrics (same as frontend computeProBenchmarkFromBacktest + fillProMetricsFromWfaPeriods)
  const equityCurve = backtest?.equityCurve as unknown[] | undefined;
  let proBenchmarkMetrics: Record<string, unknown> | null =
    computeProBenchmarkFromBacktest(
      results as Record<string, unknown>,
      equityCurve,
      undefined,
      wfaRaw as Record<string, unknown> | null | undefined,
      undefined,
    ) as Record<string, unknown>;
  if (wfaRaw && typeof wfaRaw === "object") {
    fillProMetricsFromWfaPeriods(
      proBenchmarkMetrics as import("./proBenchmarkMetrics").ProBenchmarkMetricsLike,
      wfaRaw as Record<string, unknown>,
      { skipMetricDefinitionFields: wfaWindowMetrics.length >= 2 },
    );
  }
  if (
    (proBenchmarkMetrics?.windowsCount == null ||
      proBenchmarkMetrics?.windowsCount === 0) &&
    wfa?.windows?.length
  ) {
    proBenchmarkMetrics = {
      ...proBenchmarkMetrics,
      windowsCount: wfa.windows.length,
    };
  }
  if (
    totalTradesForSignificance != null &&
    totalTradesForSignificance < MIN_TRADES_FOR_SIGNIFICANCE &&
    proBenchmarkMetrics
  ) {
    proBenchmarkMetrics = { ...proBenchmarkMetrics, parameterStabilityIndex: undefined };
  }

  // Turnover & cost drag from normalized trades (Freqtrade or Kiploks shape)
  // Try multiple payload paths so standalone/integration trades are found
  const rawTrades = (backtest?.trades ??
    (backtestRaw as Record<string, unknown>)?.trades ??
    (results as Record<string, unknown>)?.trades ??
    unifiedPayload.trades) as unknown[] | undefined;
  const normalizedTrades = normalizeTradesForTurnover(rawTrades, symbol);
  const initialBalance =
    typeof config.initialBalance === "number" &&
    Number.isFinite(config.initialBalance)
      ? config.initialBalance
      : 1000;
  const backtestResultLike = {
    config: {
      initialBalance,
      startDate: String(config.startDate ?? dateFromPayload ?? ""),
      endDate: String(config.endDate ?? dateToPayload ?? ""),
      commission:
        typeof config.commission === "number" &&
        Number.isFinite(config.commission)
          ? config.commission
          : undefined,
      slippage:
        typeof config.slippage === "number" && Number.isFinite(config.slippage)
          ? config.slippage
          : undefined,
    },
    results: (results || {}) as {
      totalTrades?: number;
      profitFactor?: number;
      annualizedReturn?: number;
      totalReturn?: number;
    },
    trades: normalizedTrades,
  };
  const turnoverAndCostDrag =
    normalizedTrades.length > 0
      ? buildTurnoverAndCostDrag(backtestResultLike, null, wfaRaw ?? undefined)
      : null;

  // Canonical metrics (Layer 2): single source per metric for blocks.
  const payloadRisk = unifiedPayload.riskAnalysis as unknown;
  const oosTradesRaw = (unifiedPayload as Record<string, unknown>).oos_trades;
  const oosTrades = Array.isArray(oosTradesRaw) ? oosTradesRaw : [];
  const hasOosTrades = oosTrades.length > 0;
  const bcForCanonical = unifiedPayload.benchmarkComparison as Record<string, unknown> | null | undefined;
  const fullBacktestMetrics = computeFullBacktestMetrics({
    results: results as Record<string, unknown>,
    equityCurve: equityCurve ?? undefined,
    config: config as Record<string, unknown>,
    benchmarkComparison: bcForCanonical ?? undefined,
  });
  const wfaRows =
    wfaRawObj && typeof wfaRawObj === "object"
      ? wfaRowsForMetrics(wfaRawObj as Record<string, unknown>)
      : [];
  const oosMetrics = hasOosTrades
    ? computeOOSMetricsFromTrades(oosTrades as import("./riskAnalysis").OosTradeLike[], initialBalance)
    : payloadRisk && typeof payloadRisk === "object"
      ? mapPayloadRiskToOOSMetrics(payloadRisk as Record<string, unknown>, initialBalance)
      : wfaRows.length > 0
        ? aggregateOOSFromWFAWindows(wfaRows, initialBalance)
        : null;

  // Layer 2.5: canonical WFE (median), OOS Retention, Performance Degradation (wfaWindowMetrics built earlier for single-source)
  let wfeResult: ReturnType<typeof computeWFEMetric_v2> | null = null;
  let oosRetentionResult: ReturnType<typeof computeOOSRetention> | null = null;
  let performanceDegradationResult: ReturnType<typeof computePerformanceDegradation> | null = null;
  if (wfaWindowMetrics.length >= 2) {
    wfeResult = computeWFEMetric_v2(wfaWindowMetrics);
    oosRetentionResult = computeOOSRetention(wfaWindowMetrics);
    performanceDegradationResult = computePerformanceDegradation(wfaWindowMetrics);
    // Single source for retention and optimizationGain: sumIs/sumOos from wfaWindowMetrics (avoids contradiction: retention 118% vs gain +1.86%)
    const sumIsFromWindows = wfaWindowMetrics
      .map((w) => w.isMetrics.totalReturn)
      .filter((v): v is number => Number.isFinite(v))
      .reduce((a, b) => a + b, 0);
    const sumOosFromWindows = wfaWindowMetrics
      .map((w) => w.oosMetrics.totalReturn)
      .filter((v): v is number => Number.isFinite(v))
      .reduce((a, b) => a + b, 0);
    proBenchmarkMetrics = {
      ...proBenchmarkMetrics,
      sumIs: sumIsFromWindows,
      sumOos: sumOosFromWindows,
      optimizationGain: sumIsFromWindows - sumOosFromWindows,
    } as typeof proBenchmarkMetrics;
    if (wfeResult) {
      const prevDefs = typeof proBenchmarkMetrics?.metricDefinitions === "object" && proBenchmarkMetrics?.metricDefinitions !== null
        ? (proBenchmarkMetrics.metricDefinitions as Record<string, MetricDefinitionForApi>)
        : {};
      const wfeMerge: Record<string, unknown> = {
        ...proBenchmarkMetrics,
        metricDefinitionVersions: {
          ...(typeof proBenchmarkMetrics?.metricDefinitionVersions === "object" && proBenchmarkMetrics?.metricDefinitionVersions !== null
            ? (proBenchmarkMetrics.metricDefinitionVersions as Record<string, string>)
            : {}),
          WFE: "2.0",
        },
        metricDefinitions: { ...prevDefs, WFE: toMetricDefinitionForApi(wfeResult.definition) },
      };
      if (wfeResult.value != null && wfeResult.wfeDistribution) {
        wfeMerge.wfeDistribution = wfeResult.wfeDistribution;
      } else if (wfeResult.value == null) {
        // WFE N/A (e.g. < 3 windows with IS>0); do not keep payload's wfeDistribution.median = 0
        wfeMerge.wfeDistribution = undefined;
      }
      if (wfeResult.wfeValidWindowCount != null) wfeMerge.wfeValidWindowCount = wfeResult.wfeValidWindowCount;
      if (wfeResult.wfeWindowClassification != null) wfeMerge.wfeWindowClassification = wfeResult.wfeWindowClassification;
      if (wfeResult.profitableAmongPositiveIsCount != null) {
        wfeMerge.profitableAmongPositiveIsCount = wfeResult.profitableAmongPositiveIsCount;
      }
      const totalW = proBenchmarkMetrics?.totalWindows as number | undefined;
      if (typeof totalW === "number" && wfeResult.wfeValidWindowCount != null && totalW > 0 && wfeResult.wfeValidWindowCount !== totalW) {
        engineWarn(
          "[buildTestResultData] WFE N (IS>0 only)",
          wfeResult.wfeValidWindowCount,
          "differs from total WFA windows",
          totalW,
        );
      }
      proBenchmarkMetrics = wfeMerge as typeof proBenchmarkMetrics;
      // Single source (BENCH_SINGLE_SOURCE_AUDIT): WFA block uses same WFE as Layer 2.5 so both blocks show the same value or N/A.
      if (wfa && typeof wfa === "object") {
        const wfaRecord = wfa as unknown as Record<string, unknown>;
        wfaRecord.wfe = wfeResult.value ?? undefined;
        const windows = (wfaRecord.windows as Array<{ oosTradesCount?: number }>) ?? [];
        const totalWindows = windows.length;
        const zombieCount = windows.filter((w) => typeof w.oosTradesCount === "number" && w.oosTradesCount === 0).length;
        const logicParalysis =
          totalWindows > 0 &&
          zombieCount > totalWindows / 2 &&
          windows.some((w) => typeof w.oosTradesCount === "number");
        const { verdict, verdictExplanation } = computeWfaVerdict({
          wfe: typeof wfaRecord.wfe === "number" && Number.isFinite(wfaRecord.wfe as number) ? (wfaRecord.wfe as number) : undefined,
          consistency: (wfaRecord.consistency as number) ?? NaN,
          failedWindows: (wfaRecord.failedWindows as { count: number; total: number }) ?? { count: 0, total: 0 },
          overfittingScore: (wfaRecord.overfittingRisk as { score?: number })?.score ?? NaN,
          logicParalysis,
        });
        wfaRecord.verdict = verdict;
        wfaRecord.verdictExplanation = verdictExplanation;
      }
    }
    if (oosRetentionResult.value != null || Math.abs(sumIsFromWindows) >= 1e-12) {
      const prevDefs = typeof proBenchmarkMetrics?.metricDefinitions === "object" && proBenchmarkMetrics?.metricDefinitions !== null
        ? (proBenchmarkMetrics.metricDefinitions as Record<string, MetricDefinitionForApi>)
        : {};
      // Single source: use metric result (from performanceRatios.calcRetention). Fallback to sum ratio only when result is N/A.
      const retentionValue = oosRetentionResult.value ?? (Math.abs(sumIsFromWindows) >= 1e-12 ? sumOosFromWindows / sumIsFromWindows : null);
      proBenchmarkMetrics = {
        ...proBenchmarkMetrics,
        ...(retentionValue != null ? { oosRetention: retentionValue } : {}),
        metricDefinitionVersions: {
          ...(typeof proBenchmarkMetrics?.metricDefinitionVersions === "object" && proBenchmarkMetrics?.metricDefinitionVersions !== null
            ? (proBenchmarkMetrics.metricDefinitionVersions as Record<string, string>)
            : {}),
          OOS_Retention: "1.1",
        },
        metricDefinitions: { ...prevDefs, OOS_Retention: toMetricDefinitionForApi(oosRetentionResult.definition) },
      } as typeof proBenchmarkMetrics;
    }
    // Contract: (meanOOS - meanIS) / |meanIS|. Use mean-based only; value from full-precision period returns (hand calc with rounded % may differ, e.g. -17% vs -19%).
    const performanceDegradationValue = performanceDegradationResult.value;
    if (performanceDegradationValue != null) {
      const defVersions = typeof proBenchmarkMetrics?.metricDefinitionVersions === "object" && proBenchmarkMetrics?.metricDefinitionVersions !== null
        ? (proBenchmarkMetrics.metricDefinitionVersions as Record<string, string>)
        : {};
      const prevDefs = typeof proBenchmarkMetrics?.metricDefinitions === "object" && proBenchmarkMetrics?.metricDefinitions !== null
        ? (proBenchmarkMetrics.metricDefinitions as Record<string, MetricDefinitionForApi>)
        : {};
      proBenchmarkMetrics = {
        ...proBenchmarkMetrics,
        performanceDegradation: performanceDegradationValue,
        metricDefinitionVersions: { ...defVersions, Performance_Degradation: performanceDegradationResult.definition.version },
        metricDefinitions: { ...prevDefs, Performance_Degradation: toMetricDefinitionForApi(performanceDegradationResult.definition) },
        ...(performanceDegradationResult.caveats?.length ? { performanceDegradationCaveats: performanceDegradationResult.caveats } : {}),
      };
    }
    // Phase 1: OOS Calmar, OOS CVaR, OOS Dominance, WFA Pass Probability definitions for API
    const prevDefsBenchmark = typeof proBenchmarkMetrics?.metricDefinitions === "object" && proBenchmarkMetrics?.metricDefinitions !== null
      ? (proBenchmarkMetrics.metricDefinitions as Record<string, MetricDefinitionForApi>)
      : {};
    const defVersionsBenchmark = typeof proBenchmarkMetrics?.metricDefinitionVersions === "object" && proBenchmarkMetrics?.metricDefinitionVersions !== null
      ? (proBenchmarkMetrics.metricDefinitionVersions as Record<string, string>)
      : {};
    proBenchmarkMetrics = {
      ...proBenchmarkMetrics,
      metricDefinitionVersions: {
        ...defVersionsBenchmark,
        OOS_Calmar: "1.1",
        OOS_CVaR_95: "1.0",
        OOS_Dominance_Ratio: "1.0",
        WFA_Pass_Probability: "1.0",
      },
      metricDefinitions: {
        ...prevDefsBenchmark,
        OOS_Calmar: toMetricDefinitionForApi(OOS_CALMAR_METRIC_DEFINITION),
        OOS_CVaR_95: toMetricDefinitionForApi(OOS_CVAR95_METRIC_DEFINITION),
        OOS_Dominance_Ratio: toMetricDefinitionForApi(OOS_DOMINANCE_RATIO_METRIC_DEFINITION),
        WFA_Pass_Probability: toMetricDefinitionForApi(WFA_PASS_PROBABILITY_METRIC_DEFINITION),
      },
    };
    // Phase 10: metricsRegistry (WFE, OOS_Retention, Performance_Degradation, OOS_CVaR_95) for invariants and UI
    const metricsRegistry: Record<string, { formula?: string; base_series?: string; n_used?: number; bothNegative?: boolean; n_negative_wfe?: number; n_positive_wfe?: number }> = {};
    if (wfeResult?.wfeDistribution && (wfeResult.wfeDistribution as Record<string, unknown>).nPositiveWfe != null) {
      const dist = wfeResult.wfeDistribution as { nNegativeWfe?: number; nPositiveWfe?: number };
      const nUsed = wfeResult.wfeValidWindowCount ?? (dist.nNegativeWfe ?? 0) + (dist.nPositiveWfe ?? 0);
      metricsRegistry.WFE = {
        formula: "median(OOS/IS per window)",
        base_series: "wfaWindowMetrics",
        n_used: nUsed,
        n_negative_wfe: dist.nNegativeWfe ?? 0,
        n_positive_wfe: dist.nPositiveWfe ?? 0,
      };
    }
    if (oosRetentionResult?.value != null || Math.abs(sumIsFromWindows) >= 1e-12) {
      const nUsed = wfaWindowMetrics.length;
      const bothNegative = sumIsFromWindows < 0 && sumOosFromWindows < 0;
      metricsRegistry.OOS_Retention = {
        formula: "sum(OOS)/sum(IS) over all windows",
        base_series: "wfaWindowMetrics",
        n_used: nUsed,
        ...(bothNegative ? { bothNegative: true } : {}),
      };
    }
    if (performanceDegradationResult?.value != null) {
      metricsRegistry.Performance_Degradation = {
        formula: "(mean(OOS)-mean(IS))/|mean(IS)|",
        base_series: "wfaWindowMetrics",
        n_used: wfaWindowMetrics.length,
      };
    }
    const oosCvar95 = (proBenchmarkMetrics as Record<string, unknown>)?.oosCvar95;
    const oosCvar95N = (proBenchmarkMetrics as Record<string, unknown>)?.oosCvar95N as number | undefined;
    if (typeof oosCvar95 === "number" && Number.isFinite(oosCvar95)) {
      metricsRegistry.OOS_CVaR_95 = {
        formula: "mean(worst 5% of OOS returns)",
        base_series: "wfaWindowMetrics",
        n_used: typeof oosCvar95N === "number" ? oosCvar95N : wfaWindowMetrics.length,
      };
    }
    if (Object.keys(metricsRegistry).length > 0) {
      proBenchmarkMetrics = { ...proBenchmarkMetrics, metricsRegistry } as typeof proBenchmarkMetrics;
    }
  } else if (wfaWindowMetrics.length === 1) {
    proBenchmarkMetrics = { ...proBenchmarkMetrics, insufficientWindowsWarning: true } as typeof proBenchmarkMetrics;
  }
  if (wfa && typeof wfa === "object" && wfaWindowMetrics.length < 2) {
    const wfaText = (wfa as unknown as Record<string, unknown>).textPayload as Record<string, unknown> | undefined;
    if (wfaText) {
      wfaText.wfeNaReason = "Insufficient windows (min 2 required for WFE).";
    }
  }

  // Single source for kill switch threshold (0.7): use sum-based retention when set so PASS/FAIL is deterministic
  const oosRetentionForKillSwitch =
    typeof proBenchmarkMetrics?.oosRetention === "number" && Number.isFinite(proBenchmarkMetrics.oosRetention as number)
      ? (proBenchmarkMetrics.oosRetention as number)
      : (oosRetentionResult != null && oosRetentionResult.verdict === "N/A"
          ? undefined
          : (oosRetentionResult?.value ?? undefined));

  // Risk analysis: from oos_trades (full narratives) or from canonical oosMetrics (payload/wfa aggregate).
  const riskSource = hasOosTrades ? "oos_trades" : (oosMetrics?.source ?? undefined);
  const riskAnalysisBase =
    hasOosTrades
      ? riskBuilderFromR(buildCanonicalR(oosTrades as import("./riskAnalysis").OosTradeLike[]), { oosWindowCount: 1 })
      : (oosMetrics ? buildRiskBlockFromOOSMetrics(oosMetrics) : riskBuilderFromR([]));
  const payloadRiskObj = payloadRisk && typeof payloadRisk === "object" ? (payloadRisk as Record<string, unknown>) : null;
  const usePayloadRisk = payloadRiskObj != null && typeof (payloadRiskObj as { maxDrawdown?: unknown }).maxDrawdown === "number";
  const riskAnalysis =
    usePayloadRisk && payloadRiskObj
      ? { ...payloadRiskObj, riskAnalysisVersion: (payloadRiskObj.riskAnalysisVersion as number) ?? 0 }
      : riskAnalysisBase && riskSource
      ? { ...(riskAnalysisBase as unknown as Record<string, unknown>), source: riskSource, riskAnalysisVersion: 1 }
      : riskAnalysisBase != null
      ? { ...(riskAnalysisBase as unknown as Record<string, unknown>), riskAnalysisVersion: 1 }
      : null;
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
    const source = hasOosTrades ? "oos_trades" : (oosMetrics ? oosMetrics.source : "empty");
    const md = (riskAnalysis as { maxDrawdown?: number } | null)?.maxDrawdown;
    engineInfo(
      `[buildTestResultData] riskAnalysis source=${source} maxDrawdown=${md != null && Number.isFinite(md) ? md : "n/a"}`,
    );
  }

  // Parameter sensitivity for robustness (Stability module): need >= 3 trials (hyperopt or WFA-derived)
  type ParamSensForRobustness = {
    parameters: Array<{ sensitivity?: number }>;
  } | null;
  let parameterSensitivityForRobustness: ParamSensForRobustness = null;
  if (wfaRaw && typeof wfaRaw === "object") {
    const trials =
      Array.isArray((unifiedPayload as Record<string, unknown>).hyperoptTrials) &&
      ((unifiedPayload as Record<string, unknown>).hyperoptTrials as unknown[])
        .length >= 3
        ? ((unifiedPayload as Record<string, unknown>).hyperoptTrials as unknown[])
        : buildTrialsFromWfa(
            wfaRaw as import("./parameterSensitivity").WfaLike,
          );
    if (trials.length >= 3) {
      const computed = computeParameterSensitivityFromTrials(trials);
      if (computed?.parameters?.length) {
        parameterSensitivityForRobustness = { parameters: computed.parameters };
      }
    }
  }

  // Robustness score: use transformed WFA, computed riskAnalysis, parameterSensitivity, turnoverAndCostDrag
  if (wfaRaw && typeof wfaRaw === "object" && wfa) {
    robustnessScore = calculateRobustnessScore(
      backtest,
      wfa ?? wfaRaw,
      undefined,
      proBenchmarkMetrics ?? undefined,
      riskAnalysis ?? undefined,
      parameterSensitivityForRobustness ?? undefined,
      turnoverAndCostDrag ?? undefined,
    );
  }

  // Data Quality Guard (DQG): multi-module per DATA_QUALITY_GUARD_ARCHITECTURE.md.
  const dataRangeDays = parseDateToDays(dateFromPayload, dateToPayload);
  const timeframeMs = (() => {
    const tf = (strategy.timeframe ?? config?.timeframe ?? "") as string;
    if (tf === "1m") return 60000;
    if (tf === "5m") return 5 * 60000;
    if (tf === "15m") return 15 * 60000;
    if (tf === "1h") return 60 * 60000;
    if (tf === "4h") return 4 * 60 * 60000;
    if (tf === "1d") return 24 * 60 * 60000;
    return 60 * 60000;
  })();
  const candlesRaw = (backtest?.candles ?? unifiedPayload.candles) as
    | unknown[]
    | undefined;
  const candlesForDqg =
    Array.isArray(candlesRaw) && candlesRaw.length > 0
      ? (candlesRaw as Record<string, unknown>[])
      : undefined;
  const positionSize = (unifiedPayload.positionSize ??
    backtest?.positionSize ??
    config?.positionSize) as number | undefined;
  const volumePerBar = (unifiedPayload.volumePerBar ??
    backtest?.volumePerBar ??
    config?.volumePerBar) as number | undefined;
  // DQG: only raw payload (unifiedPayload.dqg per docs/DQG_RAW_PAYLOAD_SCHEMA.md). No alternate dqgA/dqgB keys.
  const payloadRecord = unifiedPayload as Record<string, unknown>;
  const rawDqg =
    payloadRecord.dqg &&
    typeof payloadRecord.dqg === "object" &&
    !Array.isArray(payloadRecord.dqg)
      ? (payloadRecord.dqg as Record<string, unknown>)
      : null;
  const precomputedGapDensity: DQGModuleResult | undefined = rawDqg
    ? computeGapDensityFromRaw(rawDqg.dqgA as Record<string, unknown> | undefined)
    : undefined;
  const meta = rawDqg?.meta as Record<string, unknown> | undefined;
  const candlesLoaded =
    meta != null &&
    typeof meta === "object" &&
    typeof meta.candlesLoaded === "number" &&
    Number.isFinite(meta.candlesLoaded)
      ? (meta.candlesLoaded as number)
      : undefined;
  const precomputedPriceIntegrity: DQGModuleResult | undefined = rawDqg
    ? computePriceIntegrityFromRaw(
        rawDqg.dqgB as Record<string, unknown> | undefined,
        candlesLoaded,
      )
    : undefined;

  const dqgResult = runDataQualityGuard({
    trades: Array.isArray(rawTrades)
      ? (rawTrades as Record<string, unknown>[])
      : [],
    candles: candlesForDqg,
    timeframeMs,
    dataRangeDays: dataRangeDays ?? undefined,
    paramCount: paramsCount,
    positionSize: Number.isFinite(positionSize) ? positionSize : undefined,
    volumePerBar: Number.isFinite(volumePerBar) ? volumePerBar : undefined,
    precomputedGapDensity,
    precomputedPriceIntegrity,
  });
  const dataQualityGuardScore = dqgResult.finalScore;
  const dataQualityInsufficient =
    dqgResult.blocked ||
    (dataRangeDays != null && dataRangeDays < DATA_QUALITY_MIN_DAYS);
  // When gate forces Fail, displayed DQG must be 0 (not PASS 80%) - single source consistency.
  const dataQualityModuleValue =
    dataQualityInsufficient
      ? 0
      : (Number.isFinite(dataQualityGuardScore) ? dataQualityGuardScore * 100 : undefined);
  const dataQualityGuardComponent = dataQualityInsufficient
    ? 0
    : (Number.isFinite(dataQualityGuardScore) ? dataQualityGuardScore : undefined);
  type BlockedByKey = "validation" | "risk" | "stability" | "execution" | "dataQuality";
  const mergeBlockedByModules = (
    existing: BlockedByKey[] | undefined,
    addDataQuality: boolean
  ): BlockedByKey[] | undefined => {
    const list = existing ?? [];
    const withDq = addDataQuality && !list.includes("dataQuality") ? (["dataQuality", ...list] as BlockedByKey[]) : list;
    return withDq.length > 0 ? withDq : undefined;
  };

  let finalRobustnessScore = robustnessScore ?? null;
  if (finalRobustnessScore) {
    const components = {
      ...finalRobustnessScore.components,
      dataQuality: dataQualityGuardComponent,
    };
    const modules = {
      ...finalRobustnessScore.modules,
      dataQuality: dataQualityModuleValue,
    };
    const dqgMultiplier = dataQualityGuardComponent ?? 1;
    const existingBlocked = (finalRobustnessScore as { blockedByModules?: BlockedByKey[] }).blockedByModules ??
      (finalRobustnessScore.blockedByModule ? [finalRobustnessScore.blockedByModule as BlockedByKey] : []);
    const blockedByModules = mergeBlockedByModules(existingBlocked, dataQualityInsufficient);
    finalRobustnessScore = {
      ...finalRobustnessScore,
      components,
      modules,
      overall: Math.round(finalRobustnessScore.overall * dqgMultiplier),
      blockedByModule: dataQualityInsufficient ? "dataQuality" : finalRobustnessScore.blockedByModule,
      ...(blockedByModules && { blockedByModules }),
    };
  } else if (dataQualityModuleValue != null && dataRangeDays != null) {
    const blockedByModules = dataQualityInsufficient ? (["dataQuality"] as BlockedByKey[]) : undefined;
    finalRobustnessScore = {
      overall: dataQualityInsufficient ? 0 : NaN,
      components: {
        parameterStability: NaN,
        timeRobustness: NaN,
        marketRegime: NaN,
        monteCarloStability: NaN,
        sensitivity: NaN,
        dataQuality: dataQualityGuardComponent,
      },
      modules: {
        validation: NaN,
        risk: NaN,
        stability: NaN,
        execution: NaN,
        dataQuality: dataQualityModuleValue,
      },
      blockedByModule: dataQualityInsufficient ? "dataQuality" : undefined,
      ...(blockedByModules && { blockedByModules }),
    };
  }
  // Defensive: in current flow robustnessScore always comes from calculateRobustnessScoreFromWfa, which always sets modules. This can only trigger if robustnessScore is ever taken from payload/other source or a future code path omits modules. We warn instead of throw so submit is not broken.
  if (finalRobustnessScore != null && (finalRobustnessScore.modules == null || typeof finalRobustnessScore.modules !== "object")) {
    engineWarn(
      "RobustnessScore invariant: modules must be set when robustnessScore is present. Submit not blocked; log for monitoring."
    );
  }
  const dataQualityWarning =
    dqgResult.diagnosis ??
    (dataRangeDays != null && dataRangeDays < DATA_QUALITY_MIN_DAYS
      ? `Insufficient data period (${dataRangeDays} days). For full audit, use at least ${DATA_QUALITY_MIN_DAYS} days.`
      : undefined);

  // Enrich risk block with DQG Outlier warning when single trade dominates (backtest trades)
  type RiskOut = typeof riskAnalysis;
  let riskAnalysisOut: RiskOut = riskAnalysis;
  if (riskAnalysisOut && dqgResult?.modules) {
    const outlierModule = dqgResult.modules.find(
      (m: DQGModuleResult) => m.module === "Outlier Influence",
    );
    if (
      outlierModule &&
      (outlierModule.verdict === "REJECT" || outlierModule.verdict === "FAIL")
    ) {
      riskAnalysisOut = {
        ...(riskAnalysisOut as Record<string, unknown>),
        singleTradeDominanceWarning:
          "Warning: Outlier detected. Profit Factor is distorted by a single event.",
      } as unknown as RiskOut;
    }
  }
  // Max DD = n/a when total trade count < 5 (audit: do not show 0% as "no risk" with few trades)
  const totalTradeCount =
    normalizedTrades.length > 0
      ? normalizedTrades.length
      : ((results as { totalTrades?: number })?.totalTrades ?? 0);
  if (
    totalTradeCount < 5 &&
    riskAnalysisOut &&
    typeof (riskAnalysisOut as Record<string, unknown>).maxDrawdown === "number"
  ) {
    riskAnalysisOut = {
      ...(riskAnalysisOut as Record<string, unknown>),
      maxDrawdown: undefined,
    } as unknown as RiskOut;
  }

  const ex = config?.exchange as { name?: string } | string | undefined;
  const exchangeFromConfig =
    (typeof ex === "object" &&
    ex != null &&
    typeof ex?.name === "string" &&
    ex.name.trim()
      ? ex.name.trim()
      : null) ??
    (typeof ex === "string" && ex.trim() ? ex.trim() : null) ??
    ((config?.name as string)?.trim?.() || null);
  const exchangeStr =
    (typeof strategy.exchange === "string" && strategy.exchange.trim()
      ? strategy.exchange.trim()
      : null) ??
    exchangeFromConfig ??
    NA;

  const benchmarkComparison = (() => {
    const bc = unifiedPayload.benchmarkComparison;
    const valid = validBenchmarkComparison(bc);
    if (bc != null && !valid) {
      engineWarn(
        "[buildTestResultData] benchmarkComparison in payload rejected (invalid shape). hasStrategyCAGR=%s hasBtcCAGR=%s hasExcessReturn=%s hasInterpretation=%s",
        typeof (bc as Record<string, unknown>)?.strategyCAGR === "number",
        typeof (bc as Record<string, unknown>)?.btcCAGR === "number",
        typeof (bc as Record<string, unknown>)?.excessReturn === "number",
        Array.isArray((bc as Record<string, unknown>)?.interpretation),
      );
    }
    if (!valid || bc == null) return null;
    const bcObj = bc as Record<string, unknown>;
    const out = { ...bcObj } as TestResultData["benchmarkComparison"];
    const s = (out as Record<string, unknown>).strategyCAGR as number | undefined;
    const b = (out as Record<string, unknown>).btcCAGR as number | undefined;
    if (
      typeof s === "number" &&
      Number.isFinite(s) &&
      typeof b === "number" &&
      Number.isFinite(b)
    ) {
      const onePlusB = 1 + b / 100;
      if (onePlusB > 0) {
        (out as Record<string, unknown>).excessReturn =
          ((1 + s / 100) / onePlusB - 1) * 100;
      }
    }
    return out;
  })();

  if (proBenchmarkMetrics && typeof proBenchmarkMetrics === "object") {
    const regimeMatrix = proBenchmarkMetrics.regimeSurvivalMatrix as
      | Record<string, { pass?: boolean }>
      | undefined;
    const regimePassCount =
      regimeMatrix && typeof regimeMatrix === "object"
        ? Object.values(regimeMatrix).filter((r) => r && r.pass === true).length
        : undefined;
    const bc = benchmarkComparison as Record<string, unknown> | null;
    const killResult = evaluateKillSwitch({
      oosRetention: oosRetentionForKillSwitch,
      netEdgeBps: bc?.netEdgeBps as number | undefined,
      wfaPassProbability: proBenchmarkMetrics.wfaPassProbability as
        | number
        | undefined,
      regimePassCount,
      strategyKurtosis: bc?.strategyKurtosis as number | undefined,
      killSwitchMaxOosDrawdownWindows: proBenchmarkMetrics.killSwitchMaxOosDrawdownWindows as
        | number
        | undefined,
    });
    const wfeDist = proBenchmarkMetrics.wfeDistribution as
      | { min?: number; median?: number; max?: number }
      | undefined;
    const medianWfe = wfeDist?.median;
    const retention = proBenchmarkMetrics.oosRetention as number | undefined;
    const noDataMessage =
      proBenchmarkMetrics.windowsCount == null ||
      proBenchmarkMetrics.windowsCount === 0
        ? "WFA data not available for advanced pro metrics."
        : undefined;
    const wfeSummary = Number.isFinite(medianWfe)
      ? `Median WFE ${(medianWfe as number).toFixed(2)}`
      : undefined;
    const retentionSummary = Number.isFinite(retention)
      ? `OOS Retention ${((retention as number) * 100).toFixed(1)}%`
      : undefined;
    const wfeNaReason =
      "WFE requires at least 2 WFA windows with both optimization and validation returns. Single backtest or no WFA yields n/a.";
    const retentionNaReason =
      "Retention requires WFA windows with OOS returns. Single backtest or no WFA yields n/a.";
    proBenchmarkMetrics = {
      ...proBenchmarkMetrics,
      killSwitchTriggers: killResult.triggers,
      killSwitchKilled: killResult.isKilled,
      textPayload: {
        ...(noDataMessage && { noDataMessage }),
        ...(wfeSummary && { wfeSummary }),
        ...(retentionSummary && { retentionSummary }),
        wfeNaReason,
        retentionNaReason,
      },
    };
  }

  // Quick Win: build [A]/[B]/[C] buckets and win rate degradation; attach to proBenchmarkMetrics
  if (proBenchmarkMetrics && typeof proBenchmarkMetrics === "object") {
    const bc = benchmarkComparison as Record<string, unknown> | null;
    const risk = riskAnalysis as { metrics?: { winRate?: number } } | null;
    const res = results as Record<string, unknown> | undefined;
    const isWinRate =
      typeof res?.winRate === "number" && Number.isFinite(res.winRate)
        ? (res.winRate as number)
        : typeof res?.win_rate === "number" && Number.isFinite(res.win_rate)
          ? (res.win_rate as number)
          : undefined;
    const oosWinRate =
      risk?.metrics && typeof risk.metrics.winRate === "number" && Number.isFinite(risk.metrics.winRate)
        ? risk.metrics.winRate
        : undefined;
    const winRateDegradationPp =
      isWinRate != null && oosWinRate != null
        ? (isWinRate - oosWinRate) * 100
        : undefined;

    const wfeDist = proBenchmarkMetrics.wfeDistribution as
      | { min?: number; median?: number; max?: number; variance?: number }
      | undefined;
    const wfeMean =
      wfeDist?.median ??
      (typeof wfeDist?.min === "number" && typeof wfeDist?.max === "number" && Number.isFinite(wfeDist.min) && Number.isFinite(wfeDist.max)
        ? (wfeDist.min + wfeDist.max) / 2
        : undefined);
    const wfeVariance = wfeDist?.variance;
    const wfeStd = wfeVariance != null && Number.isFinite(wfeVariance) ? Math.sqrt(wfeVariance) : undefined;

    // [A] OOS: single source for Calmar and OOS Max DD when from WFA (fillProMetricsFromWfaPeriods sets oosMaxDrawdownFromWfa).
    const oosMaxDrawdownFromWfa = (proBenchmarkMetrics as Record<string, unknown>)?.oosMaxDrawdownFromWfa as number | undefined;
    const bucketAFromWfa = Number.isFinite(oosMaxDrawdownFromWfa);
    const oosMaxDdCanonical =
      bucketAFromWfa
        ? oosMaxDrawdownFromWfa
        : oosMetrics != null && Number.isFinite(oosMetrics.maxDrawdown)
          ? oosMetrics.maxDrawdown
          : (riskAnalysis as { maxDrawdown?: number } | null)?.maxDrawdown;
    const fullSharpeCanonical =
      fullBacktestMetrics != null && fullBacktestMetrics.sharpeRatio != null
        ? fullBacktestMetrics.sharpeRatio
        : (bc?.strategySharpeRatio as number | undefined);
    const fullCalmarCanonical =
      fullBacktestMetrics != null && fullBacktestMetrics.calmarRatio != null
        ? fullBacktestMetrics.calmarRatio
        : (bc?.strategyCalmarRatio as number | undefined);
    const fullMaxDdCanonical =
      fullBacktestMetrics != null && Number.isFinite(fullBacktestMetrics.maxDrawdown)
        ? fullBacktestMetrics.maxDrawdown
        : (riskAnalysis as { maxDrawdown?: number } | null)?.maxDrawdown;

    const buckets: import("./proBenchmarkMetrics").BenchmarkMetricsBucketsLike = {
      oosEquityBased: {
        source: bucketAFromWfa ? "wfa_window_oos" : (oosMetrics?.source ?? "WFA OOS + risk"),
        oosSharpe: proBenchmarkMetrics.avgOosSharpe as number | undefined,
        oosCalmar: proBenchmarkMetrics.avgOosCalmar as number | undefined,
        oosMaxDrawdown: oosMaxDdCanonical,
        note: "OOS equity-based metrics from validation windows (canonical).",
      },
      wfaPeriodLevel: {
        source: "WFA periods",
        wfeMean,
        wfeStd,
        oosRetention: proBenchmarkMetrics.oosRetention as number | undefined,
        profitableWindowsRatio: proBenchmarkMetrics.profitableWindowsRatio as number | undefined,
        profitableWindowsCount: proBenchmarkMetrics.profitableWindowsCount as number | undefined,
        totalWindows: proBenchmarkMetrics.totalWindows as number | undefined,
        oosIsTrendMatch: proBenchmarkMetrics.oosIsTrendMatch as boolean | undefined,
        winRateDegradationPp: winRateDegradationPp ?? null,
        isWinRate: isWinRate ?? null,
        oosWinRate: oosWinRate ?? null,
        isWinRateSource: "full_backtest",
        oosWinRateSource: hasOosTrades ? "oos_trades" : (oosMetrics?.source ?? undefined),
        note: "WFA period-level: WFE, retention, profitable windows, trend match, win rate degradation.",
      },
      fullBacktestContext: {
        source: fullBacktestMetrics?.source ?? "benchmark / backtest",
        fullSharpe: fullSharpeCanonical,
        fullCalmar: fullCalmarCanonical,
        fullMaxDrawdown: fullMaxDdCanonical,
        note: "Full backtest (IS) context; canonical full_backtest.",
      },
    };
    proBenchmarkMetrics = {
      ...proBenchmarkMetrics,
      benchmarkMetricsBuckets: buckets,
    };
  }

  // Sanitize: WFE and retention from same WFA; high retention with WFE near 0 is inconsistent (recurring bug)
  const retentionVal = proBenchmarkMetrics?.oosRetention as number | undefined;
  const wfeDist = proBenchmarkMetrics?.wfeDistribution as { median?: number } | undefined;
  const medianWfeVal = wfeDist != null && typeof wfeDist.median === "number" && Number.isFinite(wfeDist.median) ? wfeDist.median : undefined;
  if (
    retentionVal != null &&
    Number.isFinite(retentionVal) &&
    retentionVal > 0.5 &&
    medianWfeVal != null &&
    Math.abs(medianWfeVal) < 0.05
  ) {
    proBenchmarkMetrics = { ...proBenchmarkMetrics, wfeDistribution: undefined } as typeof proBenchmarkMetrics;
    const buckets = proBenchmarkMetrics.benchmarkMetricsBuckets as Record<string, unknown> | undefined;
    if (buckets?.wfaPeriodLevel != null && typeof buckets.wfaPeriodLevel === "object") {
      proBenchmarkMetrics = {
        ...proBenchmarkMetrics,
        benchmarkMetricsBuckets: {
          ...buckets,
          wfaPeriodLevel: { ...(buckets.wfaPeriodLevel as Record<string, unknown>), wfeMean: undefined },
        },
      } as typeof proBenchmarkMetrics;
    }
  }

  // For multi-window WFA, report.results.totalReturn should be the Walk-Forward (OOS) result so Judge and UI show the same reference.
  const wfaForRef = wfa as { periods?: unknown[]; windows?: unknown[] } | null;
  const wfaPeriodsForRef = (wfaForRef?.periods ?? wfaForRef?.windows) ?? [];
  const periodCountForRef = Array.isArray(wfaPeriodsForRef) ? wfaPeriodsForRef.length : 0;
  const sumOosForRef = proBenchmarkMetrics?.sumOos;
  const referenceTotalReturnWfa =
    periodCountForRef > 1 &&
    typeof sumOosForRef === "number" &&
    Number.isFinite(sumOosForRef)
      ? sumOosForRef
      : undefined;

  const tocForGrade = turnoverAndCostDrag as { executionGrade?: "simple" | "professional" | "institutional" } | null;
  const wfeFromPro = (proBenchmarkMetrics as Record<string, unknown> | undefined)?.wfeDistribution as { median?: number } | undefined;
  const wfeMedian = wfeFromPro?.median ?? (proBenchmarkMetrics as Record<string, unknown> | undefined)?.wfe;
  const tradesForGrade = (results as { totalTrades?: number })?.totalTrades ?? totalTradeCount;
  const oosRetentionForGrade = (proBenchmarkMetrics as Record<string, unknown> | undefined)?.oosRetention;
  const institutionalReadiness = computeInstitutionalReadiness({
    executionGrade: tocForGrade?.executionGrade ?? undefined,
    wfe: typeof wfeMedian === "number" && Number.isFinite(wfeMedian) ? wfeMedian : undefined,
    tradesCount: tradesForGrade,
    oosRetention: typeof oosRetentionForGrade === "number" && Number.isFinite(oosRetentionForGrade) ? oosRetentionForGrade : undefined,
  });

  const result: TestResultData = {
    strategy: {
      name: strategyName || NA,
      version: (strategy.version as string) || NA,
      symbol,
      timeframe: timeframeStr || NA,
      exchange: exchangeStr,
      testPeriodStart: dateFromPayload || NA,
      testPeriodEnd: dateToPayload || NA,
      totalConfigurations: 0,
      parametersCount: paramsCount,
    },
    parametersAndRunSettings: {
      runId: NA,
      date: NA,
      dataSource: NA,
      dataVersionHash: NA,
      strategySettings: {},
      analysisSettings: {
        timeframe: timeframeStr || NA,
        inSampleStart: dateFromPayload || NA,
        inSampleEnd: dateFromPayload || NA,
        outOfSampleStart: dateToPayload || NA,
        outOfSampleEnd: dateToPayload || NA,
        wfaWindows: wfaWindowsCount,
        optimizationMethod: NA,
        parameterGridSize: NA,
      },
      executionAndCosts: { slippage: NA, commission: NA, orderType: NA },
      validationAndBiasControls: {},
    },
    results: (() => {
      const r = results as Record<string, unknown> | undefined;
      const totalTrades =
        typeof r?.totalTrades === "number" && Number.isFinite(r.totalTrades)
          ? r.totalTrades
          : typeof r?.total_trades === "number" && Number.isFinite(r?.total_trades as number)
            ? (r.total_trades as number)
            : undefined;
      const totalReturn =
        referenceTotalReturnWfa ??
        (() => {
          const rawReturn = r?.totalReturn ?? r?.profit_total ?? r?.profit_total_pct;
          return typeof rawReturn === "number" && Number.isFinite(rawReturn)
            ? toDecimalReturn(rawReturn)
            : undefined;
        })();
      return totalTrades !== undefined || totalReturn !== undefined
        ? { totalTrades, totalReturn }
        : undefined;
    })(),
    benchmarkComparison,
    proBenchmarkMetrics: proBenchmarkMetrics ?? null,
    parameterSensitivity: (() => {
      type ParamSens = {
        diagnostics?: Record<string, unknown>;
        parameters?: unknown[];
      };
      const MIN_OOS_TRADES_FOR_PARAM_STABILITY = 5;
      const windows = (wfa?.windows ?? []) as Array<{
        oosTradesCount?: number;
      }>;
      const windowsWithCount = windows.filter(
        (w) =>
          typeof w?.oosTradesCount === "number" &&
          Number.isFinite(w.oosTradesCount),
      );
      const totalOosTrades = windowsWithCount.reduce(
        (s, w) => s + (w.oosTradesCount as number),
        0,
      );
      const minOosTradesPerPeriod =
        windowsWithCount.length > 0
          ? Math.min(...windowsWithCount.map((w) => w.oosTradesCount as number))
          : undefined;
      const insufficientOosTrades =
        windowsWithCount.length > 0 &&
        (totalOosTrades < MIN_OOS_TRADES_FOR_PARAM_STABILITY ||
          (minOosTradesPerPeriod ?? 0) < MIN_OOS_TRADES_FOR_PARAM_STABILITY);

      let trials =
        Array.isArray(unifiedPayload.hyperoptTrials) &&
        (unifiedPayload.hyperoptTrials as unknown[]).length >= 3
          ? (unifiedPayload.hyperoptTrials as unknown[])
          : [];
      if (trials.length < 3 && wfaRaw && typeof wfaRaw === "object") {
        const wfaTrials = buildTrialsFromWfa(
          wfaRaw as import("./parameterSensitivity").WfaLike,
        );
        if (wfaTrials.length >= 3) trials = wfaTrials;
      }
      const computed =
        trials.length >= 3
          ? computeParameterSensitivityFromTrials(trials)
          : null;
      const base: ParamSens | null = computed
        ? { parameters: computed.parameters }
        : null;
      const wfaForDiagnostics =
        wfaRaw && typeof wfaRaw === "object" && Array.isArray((wfaRaw as Record<string, unknown>).periods)
          ? (wfaRaw as Record<string, unknown>)
          : (wfa ?? undefined);
      const patch = buildDiagnosticsFromWfa(
        wfaForDiagnostics as WfaDiagnosticsLike | null | undefined,
        finalRobustnessScore ?? undefined,
      );
      const existingDiag = base?.diagnostics ?? {};
      const mergedDiag: Record<string, unknown> = { ...patch };
      const patchGovernanceKeys = new Set([
        "sharpeRetention",
        "sharpeDriftPct",
        "efficiencyGain",
        "maxTailRiskReduction",
        "performanceDecayPct",
        "signalAttenuation",
      ]);
      for (const k of Object.keys(existingDiag)) {
        const v = existingDiag[k];
        if (
          v != null &&
          v !== "" &&
          (typeof v !== "number" || Number.isFinite(v))
        ) {
          if (patchGovernanceKeys.has(k) && mergedDiag[k] !== undefined) {
            continue;
          }
          mergedDiag[k] = v;
        }
      }
      if (
        base?.parameters &&
        Array.isArray(base.parameters) &&
        base.parameters.length > 0
      ) {
        const audit = computeAuditVerdictFromParameters(
          base.parameters as Array<{ sensitivity: number }>,
        );
        mergedDiag.aggregateRiskScore = audit.aggregateRiskScore;
        mergedDiag.deploymentStatus = audit.deploymentStatus;
        if (audit.riskScoreBase != null) mergedDiag.riskScoreBase = audit.riskScoreBase;
        if (audit.riskScorePenalty != null) mergedDiag.riskScorePenalty = audit.riskScorePenalty;
      }
      // Performance Decay >= 80%: do not allow APPROVED and cap risk score so tier is CRITICAL (score <= 20).
      const perfDecay = mergedDiag.performanceDecayPct as number | undefined;
      if (
        typeof perfDecay === "number" &&
        Number.isFinite(perfDecay) &&
        perfDecay >= 80
      ) {
        if (
          mergedDiag.deploymentStatus === "APPROVED" ||
          mergedDiag.deploymentStatus === "APPROVED (Conditional)"
        ) {
          mergedDiag.deploymentStatus = "REJECTED";
        }
        const current = mergedDiag.aggregateRiskScore as number | undefined;
        const cap = 20;
        if (typeof current === "number" && Number.isFinite(current) && current > cap) {
          mergedDiag.aggregateRiskScore = cap;
        }
      }
      // Fail-safe: when Performance Decay is unavailable (< 3 periods), do not APPROVED (set to HOLD). Set to true for conservative risk.
      const HOLD_WHEN_DECAY_UNAVAILABLE = false;
      (mergedDiag as Record<string, unknown>).holdWhenDecayUnavailable = HOLD_WHEN_DECAY_UNAVAILABLE;
      if (
        HOLD_WHEN_DECAY_UNAVAILABLE &&
        (perfDecay == null || !Number.isFinite(perfDecay)) &&
        (mergedDiag.deploymentStatus === "APPROVED" || mergedDiag.deploymentStatus === "APPROVED (Conditional)")
      ) {
        mergedDiag.deploymentStatus = "HOLD";
      }
      // Data Quality Guard is a hard gate: when DQG blocks, Audit Verdict must not show APPROVED.
      if (
        dataQualityInsufficient ||
        finalRobustnessScore?.blockedByModule === "dataQuality"
      ) {
        mergedDiag.aggregateRiskScore = 0;
        mergedDiag.deploymentStatus = "REJECTED";
      }
      // Insufficient OOS trades: do not show parameters as Stable / APPROVED.
      if (insufficientOosTrades) {
        mergedDiag.aggregateRiskScore = 0;
        mergedDiag.deploymentStatus = "REJECTED";
      }

      const params = (base?.parameters ?? []) as Array<{
        name: string;
        sensitivity: number;
      }>;
      const rounded = (s: number) =>
        Number.isFinite(s)
          ? Math.round(s * 10 ** SENSITIVITY_PRECISION) / 10 ** SENSITIVITY_PRECISION
          : 0;
      const penalisedCount =
        params.length > 0
          ? params.filter((p) => rounded(p.sensitivity) >= PENALTY_THRESHOLD).length
          : 0;
      const highestSensParam =
        params.length > 0
          ? params.reduce((a, b) => (a.sensitivity >= b.sensitivity ? a : b))
          : null;
      const proNote = (() => {
        if (!highestSensParam) return undefined;
        const r = rounded(highestSensParam.sensitivity);
        const name = highestSensParam.name;
        const sensStr = highestSensParam.sensitivity.toFixed(2);
        if (r < STABLE_THRESHOLD) {
          return `Highest sensitivity: ${name} (${sensStr}, Stable).`;
        }
        if (r < PENALTY_THRESHOLD) {
          return `Highest sensitivity: ${name} (${sensStr}, Reliable).`;
        }
        return penalisedCount > 0
          ? `The highest risk is ${name} (sensitivity ${sensStr}). ${penalisedCount} param(s) in Needs Tuning/Fragile (>=${PENALTY_THRESHOLD}) drive the penalty and cap.`
          : `The highest risk is ${name} (sensitivity ${sensStr}).`;
      })();

      const diagnosticNaReasons: Record<string, string> = {
        surfaceGini:
          "Requires study-level parameter grid or multiple WFA configurations.",
        avgSafetyMarginPct: "Requires study-level data.",
        oosVarianceAttribution: "Requires OOS variance breakdown from WFA.",
      };
      if (mergedDiag.deploymentStatus === "REJECTED" && insufficientOosTrades) {
        diagnosticNaReasons.deploymentStatus =
          "Insufficient OOS trades; parameter stability not assessed.";
      }
      const copyContract = getCopyContract();
      const auditSummaryParts: string[] = [];
      if (mergedDiag.deploymentStatus) auditSummaryParts.push(`Deployment: ${mergedDiag.deploymentStatus}.`);
      const scoreVal = mergedDiag.aggregateRiskScore as number | undefined;
      const score = Number.isFinite(scoreVal) ? scoreVal : null;
      const tier = score != null ? (score >= RISK_CLASS_THRESHOLDS.LOW ? "LOW" : score >= 50 ? "MODERATE" : score >= 20 ? "HIGH" : "CRITICAL") : null;
      if (score != null && tier) auditSummaryParts.push(`Risk Score: ${Math.round(score)}/100 (${tier}).`);
      if (params.length > 0) {
        const maxSens = Math.max(...params.map((p) => p.sensitivity));
        auditSummaryParts.push(`maxSensitivity: ${Number(maxSens).toFixed(copyContract.sensitivityPrecision)} (same as table). penalisedCount (rounded sensitivity >= ${copyContract.penalisedThreshold}): ${penalisedCount}. Risk Score: integer (floor).`);
      }
      if (Number.isFinite(mergedDiag.performanceDecayPct)) auditSummaryParts.push(`Performance Decay: ${mergedDiag.performanceDecayPct}% (REJECTED if >= 80%).`);
      if (proNote) auditSummaryParts.push(`Pro-Note: ${proNote}`);
      const textPayload = {
        methodologyNote: METHODOLOGY_NOTE,
        copyContract: {
          manifest: copyContract.manifest,
          scale: copyContract.scale,
          pipelineDescription: copyContract.pipelineDescription,
          tooltips: copyContract.tooltips,
          stableThreshold: copyContract.stableThreshold,
          penalisedThreshold: copyContract.penalisedThreshold,
          sensitivityPrecision: copyContract.sensitivityPrecision,
          riskScorePassThreshold: copyContract.riskScorePassThreshold,
        },
        auditSummary: auditSummaryParts.length > 0 ? auditSummaryParts.join(" ") : undefined,
        ...(proNote && { proNote }),
        diagnosticNaReasons,
      };

      return {
        parameters: base?.parameters ?? [],
        diagnostics: mergedDiag,
        textPayload,
      } as TestResultData["parameterSensitivity"];
    })(),
    turnoverAndCostDrag: (() => {
      const toc = turnoverAndCostDrag;
      if (!toc) return null;
      const tocRecord = toc as Record<string, unknown>;
      const alphaHalfLifeDays = (
        tocRecord.sensitivityToAlphaDecay as { alphaHalfLifeDays?: number }
      )?.alphaHalfLifeDays;
      const alphaHalfLifeNote = Number.isFinite(alphaHalfLifeDays)
        ? undefined
        : "n/a (insufficient data)";
      const textPayload = {
        alphaHalfLifeNaReason:
          "Requires at least 30 trades to estimate; otherwise shown as n/a.",
        ...(alphaHalfLifeNote && { alphaHalfLifeNote }),
        adverseSelectionNote:
          (tocRecord.executionHedging as { adverseSelectionNote?: string })
            ?.adverseSelectionNote ?? "n/a",
      };

      const isDqgBlocked =
        dqgResult.verdict === "REJECT" ||
        dqgResult.blocked === true ||
        dqgResult.finalScore === 0;
      if (isDqgBlocked && tocRecord.deploymentClass === "Production-ready") {
        return { ...toc, deploymentClass: "Incubator", textPayload };
      }
      const actualNetEdge = (
        benchmarkComparison as { netEdgeBps?: number } | null
      )?.netEdgeBps;
      if (
        typeof actualNetEdge === "number" &&
        Number.isFinite(actualNetEdge) &&
        actualNetEdge < 0
      ) {
        return {
          ...toc,
          safetyMarginSlippage: undefined,
          breakevenSlippageBps: undefined,
          breakevenStatus: "EDGE_DEFICIT",
          breakevenFailureMode:
            toc.breakevenFailureMode != null
              ? toc.breakevenFailureMode
              : "Negative period Net Edge (cost > profit)",
          textPayload,
        };
      }
      return { ...toc, textPayload };
    })(),
    riskAnalysis: riskAnalysisOut,
    canonicalMetrics: {
      fullBacktestMetrics: fullBacktestMetrics ?? undefined,
      oosMetrics: oosMetrics ?? undefined,
      wfaWindowMetrics: wfaWindowMetrics?.length ? wfaWindowMetrics : undefined,
    },
    robustnessScore:
      finalRobustnessScore != null
        ? {
            ...finalRobustnessScore,
            textPayload: {
              moduleLabels: {
                dataQuality: "Data Quality Guard",
                validation: "Walk-Forward & OOS",
                risk: "Risk Profile",
                stability: "Parameter Stability",
                execution: "Execution Realism",
              },
              methodologyNote:
                "Formula: (Validation^0.4 × Risk^0.3 × Stability^0.2 × Execution^0.1) × DQG × 100. If any module or DQG = 0, overall → 0. Modules: Validation 40% (WFE, consistency, failed windows) - Risk 30% (PF, kurtosis, RF) - Stability 20% (fragile params, edge t-stat) - Execution 10% (slippage tolerance at 10 bps).",
            },
          }
        : null,
    dataRangeDays: dataRangeDays ?? undefined,
    dataQualityWarning: dataQualityWarning ?? undefined,
    dataQualityGuardResult: {
      finalScore: dqgResult.finalScore,
      verdict: dqgResult.verdict,
      blocked: dqgResult.blocked,
      diagnosis: dqgResult.diagnosis ?? undefined,
      modules: dqgResult.modules,
      factor: dqgResult.factor,
      contribution: dqgResult.contribution,
      isCriticalFailure: dqgResult.isCriticalFailure,
      ...(dqgResult.roadmapToPass
        ? { roadmapToPass: dqgResult.roadmapToPass }
        : {}),
      ...(!candlesForDqg?.length &&
      !precomputedGapDensity &&
      !precomputedPriceIntegrity
        ? { candleDataUnavailable: true }
        : {}),
    },
    investabilityGrade: (() => {
      const total = (wfa?.failedWindows as { total?: number })?.total;
      const count = (wfa?.failedWindows as { count?: number })?.count;
      const wfaPassRate =
        total != null && total > 0 ? 1 - (count ?? 0) / total : 0;
      const toc = turnoverAndCostDrag as {
        avgNetProfitPerTradeBps?: number;
        executionIsEstimated?: boolean;
      } | null;
      const netEdgeBps =
        toc?.avgNetProfitPerTradeBps ??
        (benchmarkComparison as { netEdgeBps?: number } | null)?.netEdgeBps ??
        0;
      const executionIsEstimated =
        toc?.executionIsEstimated === true ||
        (benchmarkComparison as { slippagePerTradeIsDefault?: boolean } | null)
          ?.slippagePerTradeIsDefault === true;
      return getInvestabilityGrade(
        dqgResult.finalScore,
        (wfa?.wfe as number) ?? 0,
        Number.isFinite(netEdgeBps) ? netEdgeBps : 0,
        wfaPassRate,
        executionIsEstimated,
      );
    })(),
    executionGrade: tocForGrade?.executionGrade ?? undefined,
    institutionalReady: institutionalReadiness.institutionalReady,
    ...(institutionalReadiness.institutionalBlockReasons.length > 0 && {
      institutionalBlockReasons: institutionalReadiness.institutionalBlockReasons,
    }),
    ...(institutionalReadiness.executionGradeUpgradeHint && {
      executionGradeUpgradeHint: institutionalReadiness.executionGradeUpgradeHint,
    }),
    walkForwardAnalysis: (() => {
      const base =
        wfa ??
        createEmptyWalkForwardAnalysis({
          verdictExplanation: "Data not available",
        });
      const raw = wfaRaw as Record<string, unknown> | undefined;
      const professional = raw?.professional as Record<string, unknown> | undefined;
      const perfDeg =
        typeof (proBenchmarkMetrics as Record<string, unknown>)?.performanceDegradation === "number" &&
        Number.isFinite((proBenchmarkMetrics as Record<string, unknown>).performanceDegradation as number)
          ? ((proBenchmarkMetrics as Record<string, unknown>).performanceDegradation as number)
          : undefined;
      const withPerfDeg = perfDeg !== undefined ? { performanceDegradation: perfDeg } : {};
      if (base && (raw?.professional != null || raw?.professionalMeta != null)) {
        return {
          ...base,
          ...(professional != null && { professional }),
          ...(raw.professionalMeta != null && { professionalMeta: raw.professionalMeta }),
          ...withPerfDeg,
        } as TestResultData["walkForwardAnalysis"];
      }
      return { ...base, ...withPerfDeg } as TestResultData["walkForwardAnalysis"];
    })(),
  };

  const verdictPayload = computeFinalVerdict(
    result as Parameters<typeof computeFinalVerdict>[0],
  );
  const tradesForWhatIf = Array.isArray(rawTrades)
    ? (rawTrades as Record<string, unknown>[])
    : [];
  const whatIfRows = buildWhatIfScenarios(
    tradesForWhatIf,
    result as Parameters<typeof buildWhatIfScenarios>[1],
    dqgResult,
    {
      currentVerdict: verdictPayload.verdict,
      candles: candlesForDqg ?? [],
    },
  );
  const scenarioTableRaw = whatIfRows.map((row) => ({
    scenario: row.scenario,
    robustness: row.robustness,
    verdict: row.verdict,
    action: row.action,
    ...(row.category ? { category: row.category } : {}),
  }));
  // §9: When DQG blocks, avoid repeating "DQG REJECT" for every row; show one block row + one hypothetical line.
  const scenarioTable =
    dqgResult.isCriticalFailure === true
      ? [
          {
            scenario: "Data Quality Guard",
            robustness: 0,
            verdict: "N/A",
            action: "DQG REJECT - fix data quality first.",
          },
          {
            scenario: "If 30 trades (hypothetical)",
            robustness: 20,
            verdict: "N/A",
            action: "Estimated score 20/100 - add more data to run full What-If.",
          },
        ]
      : scenarioTableRaw;
  const strategyActionPlanPrecomputed = buildStrategyActionPlanPrecomputed(
    result as Parameters<typeof buildStrategyActionPlanPrecomputed>[0],
  );
  const decisionArtifacts = buildDecisionArtifacts({
    robustnessScore: result.robustnessScore,
    walkForwardAnalysis: result.walkForwardAnalysis,
    riskAnalysis: result.riskAnalysis,
    parameterSensitivity: result.parameterSensitivity,
    turnoverAndCostDrag: result.turnoverAndCostDrag,
    proBenchmarkMetrics: result.proBenchmarkMetrics,
    verdictPayload,
    strategyActionPlanPrecomputed,
  });
  // Institutional grade for FAIL + high WFA failure rate is applied at submit via runProfessionalWfa
  // (FAIL_VERDICT_HIGH_FAILURE_RATE). Do not re-derive or cap investabilityGrade here - avoids drift vs Layer 2.5 / professional block.
  const finalReport: TestResultData = {
    ...result,
    schemaVersion: 2,
    verdictPayload: { ...verdictPayload, scenarioTable },
    decisionSummary: decisionArtifacts.decisionSummary,
    decisionLogic: decisionArtifacts.decisionLogic,
    ...(strategyActionPlanPrecomputed != null
      ? { strategyActionPlanPrecomputed }
      : {}),
  };
  // Ensure Zod schema never sees NaN (expected number, received NaN). Sanitize only fields validated by testResultDataSchema.
  sanitizeReportNumbersForJudge(finalReport);
  const judgeResult = runIntegrityJudge(finalReport as TestResultDataLike, {});
  finalReport.integrityIssues = judgeResult.issues;
  if (judgeResult.issues.length > 0) {
    engineWarn("[buildTestResultData] Integrity Judge: issues=", judgeResult.issues);
  }
  return finalReport;
}
