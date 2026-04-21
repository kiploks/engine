/**
 * Pro benchmark metrics from backtest and WFA (aligned with the historical analysis transformer layout).
 * Full set of fields so analysis cards match the UI expectations.
 */

import {
  buildEquityCurveFromReturns,
  calculateEdgeHalfLifeFromAcf,
  calculateMaxDrawdown,
} from "./financialMath";
import { calcRetention } from "./performanceRatios";
import { toDecimalReturn } from "./normalize";
import { calcWfeCvar95 } from "./wfeFormulas";
import { engineWarn } from "./logger";

export interface ProBenchmarkMetricsLike {
  wfeDistribution?: { min: number; median: number; max: number; variance: number };
  windowsCount?: number;
  avgOosSharpe?: number;
  avgOosCalmar?: number;
  psiNote?: string;
  oosDominanceRatio?: number;
  edgeHalfLife?: { windows: number; days: number };
  parameterStabilityIndex?: number;
  oosCvar95?: number;
  avgOosMeanReturn?: number;
  avgOosStdReturn?: number;
  optimizationGain?: number;
  oosRetention?: number;
  wfaPassProbability?: number;
  killSwitchMaxOosDrawdownWindows?: number;
  /** Human-readable reasons for Kill Switch trigger; set when any threshold is breached. */
  killSwitchTriggers?: string[];
  /** True when one or more Kill Switch rules triggered. */
  killSwitchKilled?: boolean;
  regimeSurvivalMatrix?: Record<
    string,
    { pass: boolean; fragile: boolean; fail: boolean }
  >;
  marketBias?: "Bullish" | "Bearish" | "Sideways";
  strategyFingerprint?: string;
  /** Sum of optimization returns (IS) across WFA periods; for Integrity Judge Rule 6. */
  sumIs?: number;
  /** Sum of validation returns (OOS) across WFA periods; for Integrity Judge Rule 6. */
  sumOos?: number;
  /** Quick Win: count of WFA windows with validation return > 0. */
  profitableWindowsCount?: number;
  /** Quick Win: total WFA windows used for profitable ratio. */
  totalWindows?: number;
  /** Quick Win: (windows with validation return > 0) / total; threshold > 0.5 = PASS. */
  profitableWindowsRatio?: number;
  /** Quick Win: true when sign(mean IS) === sign(mean OOS); false = red flag. */
  oosIsTrendMatch?: boolean;
  /** True when WFA window count < 2; retention/degradation/WFE should show as "-" with tooltip in UI. */
  insufficientWindowsWarning?: boolean;
  /** Quick Win: three explicit buckets [A] OOS equity, [B] WFA period-level, [C] full backtest. */
  benchmarkMetricsBuckets?: BenchmarkMetricsBucketsLike;
  [key: string]: unknown;
}

/** Quick Win: [A] OOS equity-based metrics. */
export interface OosEquityBucketLike {
  source: string;
  oosSharpe?: number;
  oosCalmar?: number;
  oosMaxDrawdown?: number;
  note: string;
}

/** Quick Win: [B] WFA period-level metrics. */
export interface WfaPeriodLevelBucketLike {
  source: string;
  wfeMean?: number;
  wfeStd?: number;
  oosRetention?: number;
  oosRetentionAt90?: number;
  profitableWindowsRatio?: number;
  profitableWindowsCount?: number;
  totalWindows?: number;
  oosIsTrendMatch?: boolean;
  winRateDegradationPp?: number | null;
  isWinRate?: number | null;
  oosWinRate?: number | null;
  /** Source of IS win rate (canonical). */
  isWinRateSource?: "full_backtest";
  /** Source of OOS win rate (canonical). */
  oosWinRateSource?: "oos_trades" | "wfa_window_oos" | "payload";
  note: string;
}

/** Quick Win: [C] Full backtest context (IS only, no WFA split). */
export interface FullBacktestContextBucketLike {
  source: string;
  fullSharpe?: number;
  fullCalmar?: number;
  fullMaxDrawdown?: number;
  note: string;
}

export interface BenchmarkMetricsBucketsLike {
  oosEquityBased: OosEquityBucketLike;
  wfaPeriodLevel: WfaPeriodLevelBucketLike;
  fullBacktestContext: FullBacktestContextBucketLike;
}

/**
 * Normalize period.parameters to Record<string, number> (only finite numbers).
 */
function getParametersAsNumbers(params: Record<string, unknown> | undefined): Record<string, number> {
  if (!params || typeof params !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/**
 * Parameter Stability Index from WFA windows (same logic as frontend riskAnalysis.calculatePsiDetails).
 * Exported as an object so tests can `vi.spyOn(..., "compute")` without changing production call sites.
 */
export const psiDetailsCalculator = {
  compute(
    windows: Array<{ parameters: Record<string, number> }>,
  ): { value: number; note?: string } {
    const parameterRanges: Record<string, { min: number; max: number }> = {};
    windows.forEach((window) => {
      Object.entries(window.parameters).forEach(([key, value]) => {
        if (!Number.isFinite(value)) return;
        const entry = parameterRanges[key] || { min: value, max: value };
        entry.min = Math.min(entry.min, value);
        entry.max = Math.max(entry.max, value);
        parameterRanges[key] = entry;
      });
    });

    const parameterDispersion = Object.entries(parameterRanges)
      .map(([key, range]) => ({
        key,
        dispersion: range.max - range.min,
      }))
      .filter((entry) => Number.isFinite(entry.dispersion) && entry.dispersion > 0)
      .sort((a, b) => b.dispersion - a.dispersion);

    if (parameterDispersion.length === 0) {
      return { value: 0, note: "stable" };
    }

    const selectedKeys =
      parameterDispersion.length > 3
        ? parameterDispersion.slice(0, 3).map((entry) => entry.key)
        : parameterDispersion.map((entry) => entry.key);

    let sum = 0;
    let count = 0;
    for (let i = 1; i < windows.length; i++) {
      const prev = windows[i - 1];
      const curr = windows[i];
      for (const key of selectedKeys) {
        const value = curr.parameters[key];
        const prevValue = prev.parameters[key];
        const range = parameterRanges[key];
        if (!Number.isFinite(value) || !Number.isFinite(prevValue) || !range) continue;
        // Keys in parameterDispersion have max > min, so denom is finite and > 0.
        const denom = range.max - range.min;
        sum += Math.abs(value - prevValue) / denom;
        count += 1;
      }
    }

    return count ? { value: sum / count } : { value: 0, note: "stable" };
  },
};

function getWindowDays(p: Record<string, unknown>): number {
  const start =
    (p.validationStartDate ??
      p.validation_start_date ??
      p.startDate ??
      p.start_date ??
      p.start ??
      "") as string;
  const end =
    (p.validationEndDate ??
      p.validation_end_date ??
      p.endDate ??
      p.end_date ??
      p.end ??
      "") as string;
  if (!start || !end) return NaN;
  const startMs = new Date(String(start).slice(0, 10)).getTime();
  const endMs = new Date(String(end).slice(0, 10)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return NaN;
  return (endMs - startMs) / (24 * 60 * 60 * 1000);
}

function getPeriodReturn(
  p: Record<string, unknown>,
  field: "optimizationReturn" | "validationReturn",
): number {
  const metrics = p.metrics as Record<string, Record<string, unknown>> | undefined;
  const raw =
    field === "optimizationReturn"
      ? p.optimizationReturn ??
        p.optimization_return ??
        metrics?.optimization?.totalReturn ??
        metrics?.optimization?.total ??
        (metrics?.optimization as Record<string, unknown>)?.total_return
      : p.validationReturn ??
        p.validation_return ??
        metrics?.validation?.totalReturn ??
        metrics?.validation?.total ??
        (metrics?.validation as Record<string, unknown>)?.total_return;
  const decimal = toDecimalReturn(raw);
  return typeof decimal === "number" && Number.isFinite(decimal) ? decimal : NaN;
}

function getPeriodReturns(p: Record<string, unknown>): {
  validationReturn: number;
  optimizationReturn: number;
} {
  return {
    optimizationReturn: getPeriodReturn(p, "optimizationReturn"),
    validationReturn: getPeriodReturn(p, "validationReturn"),
  };
}

function toBalance(point: unknown): number | null {
  if (point == null) return null;
  if (typeof point === "number" && Number.isFinite(point)) return point;
  const p = point as Record<string, unknown>;
  const b = p?.balance ?? p?.value ?? p?.equity;
  return typeof b === "number" && Number.isFinite(b) ? b : null;
}

/**
 * Compute ProBenchmarkMetrics from backtest (and optional WFA).
 * Equity curve: array of { balance }, { value }, or { equity } (Freqtrade uses "equity").
 */
export function computeProBenchmarkFromBacktest(
  results: Record<string, unknown> | undefined,
  equityCurve?: unknown[],
  _trades?: unknown[],
  wfa?: Record<string, unknown> | null,
  existingMetrics?: ProBenchmarkMetricsLike | null,
): ProBenchmarkMetricsLike {
  const metrics: ProBenchmarkMetricsLike = { ...(existingMetrics || {}) };

  const windowsCount =
    (Array.isArray(wfa?.periods) ? (wfa.periods as unknown[]).length : 0) ||
    (Array.isArray(wfa?.windows) ? (wfa.windows as unknown[]).length : 0) ||
    existingMetrics?.windowsCount ||
    0;
  metrics.windowsCount = windowsCount;

  const equityReturns: number[] = [];
  if (equityCurve && equityCurve.length > 1) {
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = toBalance(equityCurve[i - 1]);
      const curr = toBalance(equityCurve[i]);
      if (prev != null && curr != null && typeof prev === "number" && typeof curr === "number" && prev > 0) {
        equityReturns.push((curr - prev) / prev);
      }
    }
  }

  if (equityReturns.length >= 2) {
    const mean = equityReturns.reduce((a, b) => a + b, 0) / equityReturns.length;
    const variance =
      equityReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / equityReturns.length;
    const stdDev = Math.sqrt(variance);
    metrics.avgOosSharpe = stdDev > 0 ? mean / stdDev : 0;
  }

  if (equityReturns.length >= 2) {
    let peak = 1;
    let maxDD = 0;
    let cumReturn = 1;
    for (const ret of equityReturns) {
      cumReturn *= 1 + ret;
      if (cumReturn > peak) peak = cumReturn;
      const dd = (peak - cumReturn) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    const totalReturn = cumReturn - 1;
    if (maxDD > 0 && Number.isFinite(totalReturn)) {
      metrics.avgOosCalmar = totalReturn / maxDD;
    }
    // When maxDD === 0: do not set avgOosCalmar (division by zero; show n/a).
  }

  if (equityReturns.length >= 2) {
    const sortedReturns = [...equityReturns].sort((a, b) => a - b);
    const tailSize = Math.max(
      1,
      Math.min(sortedReturns.length, Math.ceil(sortedReturns.length * 0.05)),
    );
    const tailReturns = sortedReturns.slice(0, tailSize);
    if (tailReturns.length > 0) {
      const tailAvg = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
      metrics.oosCvar95 = tailAvg;
    }
  }

  // Standard: set only in WFA-augmentation or Base-stats (here: Base-stats from backtest totalReturn).
  if (results?.totalReturn !== undefined) {
    metrics.optimizationGain = results.totalReturn as number;
  }

  // Do not substitute synthetic WFE/Sharpe/Retention when there is no real data (single backtest, no equity curve).
  // Leave them undefined so UI shows n/a with [?] explanation.

  if (equityReturns.length >= 10) {
    const segmentSize = Math.floor(equityReturns.length / 3);
    const segments: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = i * segmentSize;
      const end = i === 2 ? equityReturns.length : (i + 1) * segmentSize;
      const segmentReturns = equityReturns.slice(start, end);
      const segmentReturn =
        segmentReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      segments.push(segmentReturn);
    }
    if (segments[0] !== 0) {
      const wfeValues = segments.slice(1).map((s) => s / Math.abs(segments[0]));
      if (wfeValues.length > 0 && wfeValues.every(Number.isFinite)) {
        const sorted = [...wfeValues].sort((a, b) => a - b);
        const wfeMean = wfeValues.reduce((a, b) => a + b, 0) / wfeValues.length;
        metrics.wfeDistribution = {
          min: sorted[0],
          median: sorted[Math.floor(sorted.length / 2)],
          max: sorted[sorted.length - 1],
          variance:
            wfeValues.reduce((sum, v) => sum + Math.pow(v - wfeMean, 2), 0) / wfeValues.length,
        };
      }
    }
  }

  // When < 2 WFA windows, do not set retention from Sharpe proxy (misleading); set flag for UI.
  if (windowsCount >= 1 && windowsCount < 2) {
    metrics.insufficientWindowsWarning = true;
  }

  // Standard: set only in WFA-augmentation or Base-stats (here: Base-stats Sharpe proxy when no WFA).
  if (windowsCount >= 2 && metrics.optimizationGain !== undefined && metrics.avgOosSharpe !== undefined) {
    metrics.oosRetention =
      metrics.avgOosSharpe > 0 ? Math.min(1, Math.abs(metrics.avgOosSharpe) * 2) : 0;
  }

  // Do not substitute 0 for missing PSI or edgeHalfLife.days; leave undefined so UI shows n/a and [?].
  return metrics;
}

/**
 * Options for fillProMetricsFromWfaPeriods.
 * When skipMetricDefinitionFields is true, WFE (wfeDistribution), OOS Retention, sumIs/sumOos, optimizationGain
 * are not set here so Layer 2.5 (buildWFAWindowMetrics → metric definitions) remains the single source when it runs.
 * @see docs/BENCH_SINGLE_SOURCE_AUDIT.md §7
 */
export interface FillProMetricsFromWfaPeriodsOptions {
  skipMetricDefinitionFields?: boolean;
}

/**
 * Fill oosDominanceRatio, wfaPassProbability, killSwitchMaxOosDrawdownWindows, strategyFingerprint,
 * regimeSurvivalMatrix, marketBias, avgOosMeanReturn, avgOosStdReturn from WFA periods.
 * When options.skipMetricDefinitionFields is true, does not set wfeDistribution, oosRetention, sumIs, sumOos, optimizationGain
 * (Layer 2.5 will set them from wfaWindowMetrics).
 */
export function fillProMetricsFromWfaPeriods(
  merged: ProBenchmarkMetricsLike,
  wfa: Record<string, unknown> | null | undefined,
  options?: FillProMetricsFromWfaPeriodsOptions,
): void {
  const periods = Array.isArray(wfa?.periods)
    ? (wfa.periods as Record<string, unknown>[])
    : Array.isArray(wfa?.windows)
      ? (wfa.windows as Record<string, unknown>[])
      : [];

  if (periods.length === 0) return;

  const skipMetricDefinitionFields = options?.skipMetricDefinitionFields === true;

  if (periods.length < 2) {
    merged.insufficientWindowsWarning = true;
  }

  const normalized = periods.map((p) => getPeriodReturns(p));

  const validationReturns = normalized
    .map((r) => r.validationReturn)
    .filter((v) => Number.isFinite(v)) as number[];

  const optimizationReturns = normalized
    .map((r) => r.optimizationReturn)
    .filter((v) => Number.isFinite(v)) as number[];

  if (!skipMetricDefinitionFields) {
    // When < 2 windows, do not set retention/WFE (not enough for ratio); UI shows "-" with tooltip.
    if (periods.length < 2) {
      merged.oosRetention = undefined;
      merged.wfeDistribution = undefined;
    }

    // WFE distribution from WFA periods: only windows with IS (optimizationReturn) > 0; min 3 such windows (Bug 2).
    const WFE_MIN_NORMAL_WINDOWS = 3;
    if ((merged.wfeDistribution == null || !Number.isFinite(merged.wfeDistribution.median)) && normalized.length > 0) {
      const WINSORIZE_CAP = 3.0;
      const wfeValues = normalized
        .filter(
          (r) =>
            Number.isFinite(r.optimizationReturn) &&
            r.optimizationReturn > 0 &&
            Number.isFinite(r.validationReturn),
        )
        .map((r) => {
          const opt = r.optimizationReturn as number;
          const val = r.validationReturn as number;
          const ratio = val / opt;
          return ratio > WINSORIZE_CAP ? WINSORIZE_CAP : ratio;
        });

      if (wfeValues.length >= WFE_MIN_NORMAL_WINDOWS) {
        const sorted = [...wfeValues].sort((a, b) => a - b);
        const mean = wfeValues.reduce((a, b) => a + b, 0) / wfeValues.length;
        const variance =
          wfeValues.reduce((s, v) => s + (v - mean) ** 2, 0) / wfeValues.length;
        const median =
          sorted.length % 2 === 1
            ? sorted[Math.floor(sorted.length / 2)]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

        merged.wfeDistribution = {
          min: sorted[0],
          median,
          max: sorted[sorted.length - 1],
          variance,
        };
      }
    }

    // WFA Augmentation: single source of truth from WFA periods.
    if (optimizationReturns.length > 0 && validationReturns.length > 0) {
      const sumIs = optimizationReturns.reduce((a, b) => a + b, 0);
      const sumOos = validationReturns.reduce((a, b) => a + b, 0);
      merged.sumIs = sumIs;
      merged.sumOos = sumOos;

      if (Math.abs(sumIs) < 1e-9) {
        merged.oosRetention = undefined;
        merged.optimizationGain = -sumOos;
        merged.wfeDistribution = undefined;
      } else {
        if (periods.length >= 2) {
          merged.oosRetention = calcRetention(validationReturns, optimizationReturns) ?? undefined;
        }
        merged.optimizationGain = sumIs - sumOos;
      }
    }
  }

  // PSI from WFA periods when each has parameters.
  const psiWindows = periods
    .map((p) =>
      getParametersAsNumbers(
        (p.parameters ??
          p.params ??
          p.optimization_params ??
          p.optimized_params ??
          {}) as Record<string, unknown>,
      ),
    )
    .filter((params) => Object.keys(params).length > 0);

  if (psiWindows.length >= 2) {
    const psiDetails = psiDetailsCalculator.compute(psiWindows.map((params) => ({ parameters: params })));
    if (Number.isFinite(psiDetails.value) || psiDetails.note === "stable") {
      merged.parameterStabilityIndex = psiDetails.value;
      if (psiDetails.note) merged.psiNote = psiDetails.note;
    }
  }

  if (merged.oosDominanceRatio == null || !Number.isFinite(merged.oosDominanceRatio)) {
    const oosDominanceAlpha = 0.9;
    const count = normalized.filter(
      (r) =>
        Number.isFinite(r.optimizationReturn) &&
        Number.isFinite(r.validationReturn) &&
        r.validationReturn > r.optimizationReturn * oosDominanceAlpha,
    ).length;
    merged.oosDominanceRatio = count / periods.length;
  }

  if (merged.wfaPassProbability == null || !Number.isFinite(merged.wfaPassProbability)) {
    const successes = normalized.filter((r) => r.validationReturn > 0).length;
    merged.wfaPassProbability =
      successes === 0 && normalized.length > 0 ? 0 : (successes + 1) / (periods.length + 2);
  }

  // Quick Win: Profitable Windows and OOS/IS Trend Match
  const profitableWindowsCount = normalized.filter((r) => Number.isFinite(r.validationReturn) && r.validationReturn > 0).length;
  merged.profitableWindowsCount = profitableWindowsCount;
  merged.totalWindows = periods.length;
  if (periods.length > 0) {
    merged.profitableWindowsRatio = profitableWindowsCount / periods.length;
  }

  if (optimizationReturns.length > 0 && validationReturns.length > 0) {
    const meanIs = optimizationReturns.reduce((a, b) => a + b, 0) / optimizationReturns.length;
    const meanOos = validationReturns.reduce((a, b) => a + b, 0) / validationReturns.length;
    const signIs = meanIs > 0 ? 1 : meanIs < 0 ? -1 : 0;
    const signOos = meanOos > 0 ? 1 : meanOos < 0 ? -1 : 0;
    merged.oosIsTrendMatch = signIs === signOos;
  }

  // Consecutive OOS drawdown over all windows in order (used by Kill Switch limit 1).
  if (merged.killSwitchMaxOosDrawdownWindows == null || !Number.isFinite(merged.killSwitchMaxOosDrawdownWindows)) {
    let maxStreak = 0;
    let current = 0;
    for (const r of normalized) {
      if (Number.isFinite(r.validationReturn) && r.validationReturn < 0) {
        current += 1;
        maxStreak = Math.max(maxStreak, current);
      } else {
        current = 0;
      }
    }
    merged.killSwitchMaxOosDrawdownWindows = maxStreak;
  }

  // Fingerprint from retention buckets: reuse WFA sums when fingerprint is empty.
  if (!merged.strategyFingerprint || (merged.strategyFingerprint as string).trim() === "") {
    let oosRetention = merged.oosRetention != null && Number.isFinite(merged.oosRetention)
      ? (merged.oosRetention as number)
      : NaN;

    if (!Number.isFinite(oosRetention) && optimizationReturns.length > 0 && validationReturns.length > 0) {
      const fromFormula = calcRetention(validationReturns, optimizationReturns);
      if (fromFormula != null) {
        oosRetention = fromFormula;
        merged.oosRetention = fromFormula;
      }
    }

    if (Number.isFinite(oosRetention) && oosRetention < 0.6) {
      merged.strategyFingerprint = "Regime-dependent";
    } else if (Number.isFinite(oosRetention) && oosRetention > 0.9) {
      merged.strategyFingerprint = "Momentum-like";
    } else {
      merged.strategyFingerprint = "Hybrid";
    }
  }

  const matrix: Record<string, { pass: boolean; fragile: boolean; fail: boolean }> = {
    Trend: { pass: false, fragile: false, fail: false },
    Range: { pass: false, fragile: false, fail: false },
    HighVol: { pass: false, fragile: false, fail: false },
  };

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const val = normalized[i].validationReturn;
    if (!Number.isFinite(val)) continue;
    const regime = (p.regime ?? "").toString().toLowerCase();
    const bucket =
      regime.includes("high")
        ? "HighVol"
        : regime.includes("bull") || regime.includes("bear")
          ? "Trend"
          : "Range";
    if (val >= 0.05) matrix[bucket].pass = true;
    else if (val >= 0) matrix[bucket].fragile = true;
    else matrix[bucket].fail = true;
  }
  merged.regimeSurvivalMatrix = matrix;

  const regimeCounts: Record<string, number> = { Bull: 0, Bear: 0, Sideways: 0 };
  for (const p of periods) {
    const r = (p.regime ?? "").toString().toLowerCase();
    if (r.includes("bull")) regimeCounts.Bull += 1;
    else if (r.includes("bear")) regimeCounts.Bear += 1;
    else regimeCounts.Sideways += 1;
  }

  const total = regimeCounts.Bull + regimeCounts.Bear + regimeCounts.Sideways;
  if (total > 0) {
    const top =
      regimeCounts.Bull >= regimeCounts.Bear && regimeCounts.Bull >= regimeCounts.Sideways
        ? "Bullish"
        : regimeCounts.Bear >= regimeCounts.Bull && regimeCounts.Bear >= regimeCounts.Sideways
          ? "Bearish"
          : "Sideways";
    merged.marketBias = top;
  }

  if (validationReturns.length >= 2) {
    const mean = validationReturns.reduce((a, b) => a + b, 0) / validationReturns.length;
    const variance =
      validationReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / validationReturns.length;
    const std = Math.sqrt(variance);
    merged.avgOosMeanReturn = mean;
    merged.avgOosStdReturn = std;
    // Keep Sharpe consistent with Exp. OOS Return ± Vol: Sharpe = mean/std; if vol=0 then Sharpe=0.
    merged.avgOosSharpe = std > 0 ? mean / std : 0;

    // Consistency: mean * n should equal sumOos (same source).
    const sumOos = merged.sumOos;
    const n = validationReturns.length;
    if (sumOos != null && Number.isFinite(sumOos) && Number.isFinite(mean) && n >= 1 && Math.abs(mean * n - sumOos) > 1e-6) {
      engineWarn(
        "[proBenchmarkMetrics] Exp. OOS vs sumOos mismatch: avgOosMeanReturn * n =",
        mean * n,
        "sumOos =",
        sumOos,
        "n =",
        n,
      );
    }
  }

  // Edge Half-Life from OOS returns (ACF lag-1 decay to 50%).
  const profitableRatio = merged.profitableWindowsRatio as number | undefined;
  const allowEdgeHalfLife =
    (profitableRatio == null || profitableRatio >= 0.5) &&
    (merged.edgeHalfLife == null || !Number.isFinite(merged.edgeHalfLife.windows)) &&
    validationReturns.length >= 3;

  if (allowEdgeHalfLife) {
    const acfHalfLife = calculateEdgeHalfLifeFromAcf(validationReturns);
    let edgeHalfLifeWindows = Number.isFinite(acfHalfLife.periods) ? acfHalfLife.periods : NaN;

    if (!Number.isFinite(edgeHalfLifeWindows)) {
      const baseline = validationReturns[0];
      const idx = validationReturns.findIndex((r) => r <= baseline * 0.5);
      edgeHalfLifeWindows = idx >= 0 ? idx + 1 : NaN;
    }

    const windowDaysList = periods.map((p) => getWindowDays(p)).filter(Number.isFinite) as number[];
    const avgOosDays = windowDaysList.length > 0 ? windowDaysList.reduce((a, b) => a + b, 0) / windowDaysList.length : NaN;

    const edgeHalfLifeDays =
      Number.isFinite(edgeHalfLifeWindows) && Number.isFinite(avgOosDays) ? edgeHalfLifeWindows * avgOosDays : NaN;

    if (Number.isFinite(edgeHalfLifeWindows)) {
      const round1 = (x: number) => parseFloat(Number(x).toFixed(1));
      merged.edgeHalfLife = {
        windows: round1(edgeHalfLifeWindows),
        days: round1(Number.isFinite(edgeHalfLifeDays) ? edgeHalfLifeDays : edgeHalfLifeWindows),
      };
    }
  } else if (profitableRatio != null && profitableRatio < 0.5 && merged.edgeHalfLife != null) {
    merged.edgeHalfLife = undefined;
  }

  // OOS Calmar and CVaR from same OOS series.
  if (validationReturns.length >= 2) {
    const equityCurveFromReturns = buildEquityCurveFromReturns(
      validationReturns,
      1,
      validationReturns.map((_, i) => i),
    );

    const maxDrawdownPct = calculateMaxDrawdown(equityCurveFromReturns);
    const meanReturn = validationReturns.reduce((a, b) => a + b, 0) / validationReturns.length;

    if (Number.isFinite(maxDrawdownPct) && maxDrawdownPct > 0 && Number.isFinite(meanReturn)) {
      // Calmar = mean return% / |maxDD%|
      merged.avgOosCalmar = (meanReturn * 100) / maxDrawdownPct;
    }

    // Bucket [A] OOS Max DD: decimal negative, same curve as Calmar.
    if (Number.isFinite(maxDrawdownPct) && maxDrawdownPct > 0) {
      (merged as Record<string, unknown>).oosMaxDrawdownFromWfa = -(maxDrawdownPct / 100);
    }

    // OOS CVaR 95%: single source from calcWfeCvar95
    const cvar95 = calcWfeCvar95(validationReturns);
    if (cvar95 != null) {
      const n = validationReturns.length;
      const meanRet =
        validationReturns.reduce((a, b) => a + b, 0) / validationReturns.length;
      if (Number.isFinite(meanRet) && cvar95 > meanRet) {
        engineWarn(
          "[proBenchmarkMetrics] OOS CVaR 95%",
          cvar95,
          "above mean",
          meanRet,
          "- tail mean should not exceed series mean.",
        );
      }
      if (cvar95 < 0) {
        merged.oosCvar95 = cvar95;
        if (n < 30) {
          (merged as Record<string, unknown>).oosCvar95SmallN = true;
          (merged as Record<string, unknown>).oosCvar95TailSize = Math.max(1, Math.ceil(n * 0.05));
          (merged as Record<string, unknown>).oosCvar95N = n;
        }
      }
    }
  }
}

