/**
 * Integrity Judge: final consistency check before report is sent to the client.
 * Open Core version validates semantic/report consistency rules.
 */

import type { TestResultDataLike } from "./analysisReportTypes";

const MIN_TRADES_FOR_SIGNIFICANCE = 30;
const WFE_OVERHEAT_THRESHOLD = 1.5;

export interface IntegrityJudgeOptions {
  strict?: boolean;
}

export type IntegrityIssueSeverity = "warning" | "error";

export interface IntegrityIssue {
  message: string;
  severity: IntegrityIssueSeverity;
}

export interface IntegrityJudgeResult {
  issues: IntegrityIssue[];
  isValid: boolean;
}

const DRIFT_TOLERANCE = 1e-4;

function toNum(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function pushIssue(
  issues: IntegrityIssue[],
  severity: IntegrityIssueSeverity,
  message: string,
): void {
  issues.push({ message, severity });
}

export function runIntegrityJudge(
  report: TestResultDataLike,
  _options: IntegrityJudgeOptions = {}
): IntegrityJudgeResult {
  const issues: IntegrityIssue[] = [];
  const pro = report.proBenchmarkMetrics as Record<string, unknown> | undefined;
  const wfa = report.walkForwardAnalysis as
    | { periods?: unknown[]; windows?: unknown[]; failedWindows?: { count?: number; total?: number } }
    | undefined;
  const results = report.results as { totalTrades?: number; totalReturn?: number } | undefined;
  const totalTrades = toNum(results?.totalTrades) ?? 0;
  const totalReturn = toNum(results?.totalReturn);
  const robustness = toNum((report.robustnessScore as { overall?: number } | null)?.overall) ?? 0;
  const bc = report.benchmarkComparison as Record<string, unknown> | null | undefined;
  const netEdgeBps = toNum(bc?.netEdgeBps);
  const risk = report.riskAnalysis as Record<string, unknown> | null | undefined;
  const maxDrawdown = toNum(risk?.maxDrawdown);

  const periods = (wfa?.periods ?? wfa?.windows) ?? [];
  const periodCount = Array.isArray(periods) ? periods.length : 0;
  const isMultiWindowWfa = periodCount > 1;

  const oosRetention = toNum(pro?.oosRetention);
  const optimizationGain = toNum(pro?.optimizationGain);
  const sumIsRule1 = toNum(pro?.sumIs);
  if (
    oosRetention != null &&
    oosRetention < 1 &&
    optimizationGain != null &&
    optimizationGain < 0 &&
    sumIsRule1 != null &&
    sumIsRule1 > 0
  ) {
    pushIssue(issues, "error", "Retention/Gain Paradox: Negative gain with OOS profit loss.");
  }

  if (totalTrades < MIN_TRADES_FOR_SIGNIFICANCE && robustness > 50) {
    pushIssue(issues, "warning", "Insignificant Data: High robustness score with critically low trade count.");
  }

  const wfaPassProbForRule2b = toNum(pro?.wfaPassProbability) ?? 0;
  if (
    totalTrades < MIN_TRADES_FOR_SIGNIFICANCE &&
    (robustness > 70 || wfaPassProbForRule2b > 0.7)
  ) {
    pushIssue(issues, "warning", "Insufficient sample size for reported confidence (N < 30 with high robustness or WFA pass probability).");
  }

  if (!isMultiWindowWfa) {
    const retForRule3 = totalReturn ?? toNum(bc?.strategyCAGR);
    if (
      netEdgeBps != null &&
      netEdgeBps !== 0 &&
      netEdgeBps < 0 &&
      retForRule3 != null &&
      retForRule3 > 0
    ) {
      /**
       * Single-window + low-N can legitimately show positive return with negative expected edge.
       * Keep this as warning for research contexts; escalate to error only with adequate sample.
       */
      const luckFactorSeverity: IntegrityIssueSeverity =
        totalTrades >= MIN_TRADES_FOR_SIGNIFICANCE ? "error" : "warning";
      pushIssue(issues, luckFactorSeverity, "Execution Warning: Profit with negative expected edge (Luck Factor).");
    }
  }

  const hasValidationData =
    Array.isArray(periods) &&
    (periods as Array<Record<string, unknown>>).some(
      (p) => (p.validationReturn ?? p.validation_return) != null,
    );
  if (periodCount > 0 && hasValidationData) {
    const wfaPassProb = toNum(pro?.wfaPassProbability) ?? 0;
    const failedCount = (periods as Array<Record<string, unknown>>).filter(
      (p) => (toNum(p.validationReturn ?? p.validation_return) ?? 0) <= 0,
    ).length;
    if (failedCount === periodCount && wfaPassProb > 0.2) {
      pushIssue(issues, "error", "Bayesian Anomaly: Success probability too high given 100% window failure.");
    }
  }

  const wfeMedian = toNum(
    (pro?.wfeDistribution as { median?: number } | undefined)?.median
  );
  const wfeTop = toNum((wfa as { wfe?: number })?.wfe);
  const wfe = wfeMedian ?? wfeTop;
  if (wfe != null && wfe > WFE_OVERHEAT_THRESHOLD) {
    pushIssue(issues, "error", "WFE Overheating: Anomalously high efficiency (possible overfitting or data error).");
  }

  const sumOos = toNum(pro?.sumOos);
  if (totalReturn != null && isMultiWindowWfa) {
    if (
      sumOos != null &&
      Math.abs(totalReturn - sumOos) > DRIFT_TOLERANCE
    ) {
      pushIssue(
        issues,
        "error",
        "Data Drift: Total return does not match sum of OOS periods (report may contain a different backtest).",
      );
    }
  }

  if (
    totalTrades > 10 &&
    maxDrawdown !== undefined &&
    maxDrawdown === 0
  ) {
    pushIssue(issues, "error", "Risk Reporting Error: Zero drawdown with active trading.");
  }

  if (totalReturn != null && totalReturn > 0 && maxDrawdown != null && maxDrawdown < 0) {
    const mdd = Math.abs(maxDrawdown);
    if (isMultiWindowWfa) {
      if (mdd > 1.0) {
        pushIssue(issues, "error", "MaxDrawdown units inconsistent (likely percent vs decimal).");
      }
    } else {
      if (mdd > totalReturn) {
        pushIssue(issues, "error", "MaxDrawdown exceeds total return (inconsistent risk reporting).");
      }
    }
  }

  if (
    periodCount === 0 &&
    optimizationGain != null &&
    Number.isFinite(optimizationGain)
  ) {
    pushIssue(issues, "warning", "Orphan Metric: Optimization gain present without Walk-Forward data.");
  }

  return {
    issues,
    isValid: !issues.some((i) => i.severity === "error"),
  };
}
