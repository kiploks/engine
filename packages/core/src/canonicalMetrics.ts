/**
 * Canonical metrics layer (Layer 2): single source per metric with explicit source tag.
 * Used by buildTestResultData to build blocks from one canonical source only.
 * See docs/IMPLEMENTATION_REPORT_CANONICAL_METRICS_LAYER.md and ANALYSIS_SINGLE_SOURCE_ARCHITECTURE.md.
 */

import {
  buildEquityCurveFromReturns,
  calculateCalmarRatio,
  calculateMaxDrawdown,
  calculateMean,
  calculateStdDev,
} from "./financialMath";
import { getPeriodReturn } from "./periodReturnNormalization";
import { toDecimalReturn } from "./normalize";
import {
  buildCanonicalR,
  riskBuilderFromRCore,
  type OosTradeLike,
  type RiskAnalysisResult,
  type RiskBuilderFromROptions,
} from "./riskCore";
import { buildRiskNarratives } from "./riskNarratives";

function riskBuilderFromR(
  R: number[],
  options?: RiskBuilderFromROptions,
): RiskAnalysisResult {
  const base = riskBuilderFromRCore(R, options);
  return { ...base, ...buildRiskNarratives(base) };
}

// ---------------------------------------------------------------------------
// Layer 2 types
// ---------------------------------------------------------------------------

export type FullBacktestSource = "full_backtest";

export interface FullBacktestMetrics {
  source: FullBacktestSource;
  dateFrom: string;
  dateTo: string;
  totalReturn: number;
  sharpeRatio: number | null;
  calmarRatio: number | null;
  maxDrawdown: number;
  recoveryFactor: number | null;
  gainToPain: number | null;
  totalTrades: number;
  winRate: number;
  profitFactor: number | null;
  sortinoRatio: number | null;
  initialBalance: number;
  symbol: string;
  timeframe: string;
  exchange: string | null;
}

export type OOSMetricsSource = "oos_trades" | "wfa_window_oos" | "payload";

export interface OOSMetrics {
  source: OOSMetricsSource;
  windowIndex?: number;
  windowDateRange?: { start: string; end: string };
  totalReturn: number;
  sharpeRatio: number | null;
  calmarRatio: number | null;
  maxDrawdown: number;
  recoveryFactor: number | null;
  gainToPain: number | null;
  /** OOS trade rows when available; 0 when metrics are from WFA periods or payload only. */
  totalTrades: number;
  /** When `source` is `wfa_window_oos`, number of WFA OOS periods used (same as period return count). */
  wfaOosWindowCount?: number;
  winRate: number;
  profitFactor: number | null;
  profitableWindowsRatio?: number;
  oosRetentionRatio?: number;
  initialBalance: number;
}

export interface WindowMetrics {
  totalReturn: number;
  sharpeRatio: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
}

export interface WFAWindowMetrics {
  window: number;
  dateRange: { start: string; end: string };
  source: "wfa_window";
  isMetrics: WindowMetrics;
  oosMetrics: WindowMetrics;
  sharpeRetention: number | null;
  returnRetention: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBalance(point: unknown): number | null {
  if (point == null) return null;
  if (typeof point === "number" && Number.isFinite(point)) return point;
  const p = point as Record<string, unknown>;
  const b = p?.balance ?? p?.value ?? p?.equity;
  return typeof b === "number" && Number.isFinite(b) ? b : null;
}

function equityCurveToBalanceArray(equityCurve: unknown[]): Array<{ balance: number }> {
  return equityCurve
    .map((point) => {
      const b = toBalance(point);
      return b != null ? { balance: b } : null;
    })
    .filter((x): x is { balance: number } => x != null);
}

// ---------------------------------------------------------------------------
// Full backtest metrics
// ---------------------------------------------------------------------------

export interface ComputeFullBacktestMetricsInput {
  results?: Record<string, unknown> | null;
  equityCurve?: unknown[] | null;
  config?: Record<string, unknown> | null;
  benchmarkComparison?: Record<string, unknown> | null;
}

/**
 * Build FullBacktestMetrics from backtest result and optional benchmarkComparison.
 * If benchmarkComparison has strategySharpeRatio, strategyCalmarRatio, strategyMaxDrawdown use them;
 * otherwise compute from results + equityCurve.
 */
export function computeFullBacktestMetrics(input: ComputeFullBacktestMetricsInput): FullBacktestMetrics | null {
  const { results, equityCurve, config, benchmarkComparison } = input;
  const bc = benchmarkComparison;
  const dateFrom = (config?.startDate ?? bc?.startDate ?? "") as string;
  const dateTo = (config?.endDate ?? bc?.endDate ?? "") as string;
  const initialBalance =
    (typeof config?.initialBalance === "number" && Number.isFinite(config.initialBalance)
      ? config.initialBalance
      : 1000) as number;
  const symbol = (config?.symbol ?? bc?.symbol ?? "") as string;
  const timeframe = (config?.timeframe ?? bc?.timeframe ?? "") as string;
  const exchange = (config?.exchange ?? bc?.exchange ?? null) as string | null;

  let totalReturn = (results?.totalReturn ?? results?.total_return ?? bc?.strategyCAGR) as number | undefined;
  if (totalReturn != null && Math.abs(totalReturn) > 1) totalReturn = totalReturn / 100;
  totalReturn = toDecimalReturn(totalReturn) ?? 0;

  let sharpeRatio: number | null = (bc?.strategySharpeRatio as number) ?? null;
  let calmarRatio: number | null = (bc?.strategyCalmarRatio as number) ?? null;
  let maxDrawdown: number = (bc?.strategyMaxDrawdown as number) ?? NaN;
  if (Number.isFinite(maxDrawdown) && maxDrawdown > 0) maxDrawdown = -maxDrawdown / 100;
  else if (Number.isFinite(maxDrawdown) && maxDrawdown > 1) maxDrawdown = -maxDrawdown / 100;

  const totalTrades = Number(results?.totalTrades ?? results?.total_trades ?? 0) || 0;
  let winRate = (results?.winRate ?? results?.win_rate ?? bc?.winRate) as number | undefined;
  if (winRate != null && winRate > 1) winRate = winRate / 100;
  winRate = Number.isFinite(winRate) ? (winRate as number) : 0;
  const profitFactorRaw = (results?.profitFactor ?? results?.profit_factor ?? bc?.profitFactor) as number | undefined;
  const pf =
    typeof profitFactorRaw === "number" && Number.isFinite(profitFactorRaw) ? profitFactorRaw : null;

  if (!Number.isFinite(maxDrawdown) && equityCurve && equityCurve.length > 1) {
    const balanceCurve = equityCurveToBalanceArray(equityCurve);
    const mddPct = calculateMaxDrawdown(balanceCurve);
    if (Number.isFinite(mddPct)) maxDrawdown = -(mddPct / 100);
  }
  if (!Number.isFinite(maxDrawdown)) maxDrawdown = 0;

  if (sharpeRatio == null || !Number.isFinite(sharpeRatio)) {
    if (equityCurve && equityCurve.length > 1) {
      const balanceCurve = equityCurveToBalanceArray(equityCurve);
      const returns: number[] = [];
      for (let i = 1; i < balanceCurve.length; i++) {
        const prev = balanceCurve[i - 1].balance;
        const curr = balanceCurve[i].balance;
        if (prev > 0) returns.push((curr - prev) / prev);
      }
      if (returns.length >= 2) {
        const mean = calculateMean(returns);
        const std = calculateStdDev(returns, mean);
        sharpeRatio = std > 0 ? mean / std : null;
      }
    }
  }

  if (calmarRatio == null || !Number.isFinite(calmarRatio)) {
    if (Number.isFinite(maxDrawdown) && maxDrawdown !== 0) {
      const years = dateFrom && dateTo ? (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 1;
      const cagrPct = years > 0 ? (Math.pow(1 + totalReturn, 1 / years) - 1) * 100 : totalReturn * 100;
      calmarRatio = calculateCalmarRatio(cagrPct, Math.abs(maxDrawdown) * 100);
    }
  }

  const recoveryFactor =
    Number.isFinite(totalReturn) && Number.isFinite(maxDrawdown) && maxDrawdown !== 0
      ? totalReturn / Math.abs(maxDrawdown)
      : null;
  // GtP = Net / GrossLoss = PF - 1 when from same series; when we only have PF, use that
  const gainToPain =
    pf != null && Number.isFinite(pf) ? (pf >= 1e10 ? 99 : pf - 1) : null;

  return {
    source: "full_backtest",
    dateFrom: String(dateFrom).slice(0, 10),
    dateTo: String(dateTo).slice(0, 10),
    totalReturn,
    sharpeRatio,
    calmarRatio,
    maxDrawdown,
    recoveryFactor,
    gainToPain,
    totalTrades,
    winRate,
    profitFactor: pf,
    sortinoRatio: null,
    initialBalance,
    symbol,
    timeframe,
    exchange,
  };
}

// ---------------------------------------------------------------------------
// OOS metrics from trades
// ---------------------------------------------------------------------------

/**
 * Build OOSMetrics from oos_trades. Uses riskBuilderFromR then maps to canonical shape.
 */
export function computeOOSMetricsFromTrades(
  oosTrades: OosTradeLike[],
  initialBalance: number
): OOSMetrics | null {
  if (!Array.isArray(oosTrades) || oosTrades.length === 0) return null;
  const R = buildCanonicalR(oosTrades);
  const risk = riskBuilderFromR(R, { oosWindowCount: 1 });
  return mapRiskResultToOOSMetrics(risk, "oos_trades", initialBalance);
}

/**
 * Map payload.riskAnalysis to OOSMetrics with source "payload".
 */
export function mapPayloadRiskToOOSMetrics(
  riskPayload: Record<string, unknown> | null | undefined,
  initialBalance: number
): OOSMetrics | null {
  if (!riskPayload || typeof riskPayload !== "object") return null;
  const maxDrawdown = (riskPayload.maxDrawdown ?? riskPayload.max_drawdown) as number | undefined;
  const sharpeRatio = (riskPayload.sharpeRatio ?? riskPayload.sharpe_ratio) as number | undefined;
  const recoveryFactor = (riskPayload.recoveryFactor ?? riskPayload.recovery_factor) as number | undefined;
  const metrics = riskPayload.metrics as Record<string, unknown> | undefined;
  const winRate = (metrics?.winRate ?? metrics?.win_rate) as number | undefined;
  const profitFactor = (metrics?.profitFactor ?? metrics?.profit_factor) as number | undefined;
  const payloadGtP = (riskPayload.gainToPain ?? riskPayload.gain_to_pain) as number | undefined;
  const totalReturn = Number.isFinite(maxDrawdown) && maxDrawdown !== 0 && Number.isFinite(recoveryFactor)
    ? (recoveryFactor as number) * Math.abs(maxDrawdown as number)
    : NaN;
  const gainToPainFromPayload =
    Number.isFinite(payloadGtP) ? (payloadGtP as number) : (Number.isFinite(profitFactor) ? (profitFactor as number) - 1 : NaN);
  const riskLike: RiskAnalysisResult = {
    maxDrawdown: Number.isFinite(maxDrawdown) ? (maxDrawdown as number) : NaN,
    sharpeRatio: Number.isFinite(sharpeRatio) ? (sharpeRatio as number) : NaN,
    var: NaN,
    metrics: {
      profitFactor: Number.isFinite(profitFactor) ? (profitFactor as number) : NaN,
      expectancy: NaN,
      winRate: Number.isFinite(winRate) ? (winRate as number) : NaN,
    },
    recoveryFactor: Number.isFinite(recoveryFactor) ? (recoveryFactor as number) : NaN,
    sortinoRatio: NaN,
    expectedShortfall95: NaN,
    gainToPain: gainToPainFromPayload,
    skewness: NaN,
    kurtosis: NaN,
    edgeStabilityZScore: NaN,
    durbinWatson: NaN,
    oosWindowCount: 0,
  };
  return mapRiskResultToOOSMetrics(riskLike, "payload", initialBalance);
}

function mapRiskResultToOOSMetrics(
  risk: RiskAnalysisResult,
  source: OOSMetricsSource,
  initialBalance: number
): OOSMetrics {
  const totalReturn =
    Number.isFinite(risk.recoveryFactor) && Number.isFinite(risk.maxDrawdown) && risk.maxDrawdown !== 0
      ? (risk.recoveryFactor as number) * Math.abs(risk.maxDrawdown)
      : NaN;
  const wfaOosWindowCount =
    source === "wfa_window_oos" && typeof risk.oosWindowCount === "number" && Number.isFinite(risk.oosWindowCount)
      ? risk.oosWindowCount
      : undefined;
  return {
    source,
    totalReturn: Number.isFinite(totalReturn) ? totalReturn : 0,
    sharpeRatio: Number.isFinite(risk.sharpeRatio) ? risk.sharpeRatio : null,
    calmarRatio: null,
    maxDrawdown: risk.maxDrawdown,
    recoveryFactor: Number.isFinite(risk.recoveryFactor) ? risk.recoveryFactor : null,
    gainToPain: Number.isFinite(risk.gainToPain) ? risk.gainToPain : null,
    totalTrades: 0,
    winRate: Number.isFinite(risk.metrics?.winRate) ? (risk.metrics.winRate as number) : 0,
    profitFactor: Number.isFinite(risk.metrics?.profitFactor) ? (risk.metrics.profitFactor as number) : null,
    initialBalance,
    ...(wfaOosWindowCount != null ? { wfaOosWindowCount } : {}),
  };
}

// ---------------------------------------------------------------------------
// OOS metrics from WFA windows (aggregate)
// ---------------------------------------------------------------------------

/**
 * Rows used for WFA math: `periods` if non-empty, otherwise `windows` (transform output uses `windows` only).
 */
export function wfaRowsForMetrics(wfa: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!wfa) return [];
  if (Array.isArray(wfa.periods) && wfa.periods.length > 0) return wfa.periods as Record<string, unknown>[];
  if (Array.isArray(wfa.windows) && wfa.windows.length > 0) return wfa.windows as Record<string, unknown>[];
  return [];
}

/**
 * Build OOSMetrics by aggregating validation returns from WFA rows. Source = "wfa_window_oos".
 */
export function aggregateOOSFromWFAWindows(
  periods: Record<string, unknown>[],
  initialBalance: number
): OOSMetrics | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const validationReturns = periods
    .map((p) => toDecimalReturn(p?.validationReturn ?? ((p.metrics as Record<string, unknown>)?.validation as Record<string, unknown> | undefined)?.totalReturn))
    .filter((r): r is number => Number.isFinite(r));
  if (validationReturns.length === 0) return null;
  const R = validationReturns;
  const risk = riskBuilderFromR(R, { oosWindowCount: R.length });
  return mapRiskResultToOOSMetrics(risk, "wfa_window_oos", initialBalance);
}

// ---------------------------------------------------------------------------
// WFA window metrics
// ---------------------------------------------------------------------------

/**
 * Build per-window IS/OOS metrics from walkForwardAnalysis.
 */
export function buildWFAWindowMetrics(wfa: Record<string, unknown> | null | undefined): WFAWindowMetrics[] {
  const periodRows = wfaRowsForMetrics(wfa);
  const perfTransfer = wfa?.performanceTransfer as { windows?: unknown[] } | undefined;
  const transferWindows = perfTransfer?.windows ?? [];
  const out: WFAWindowMetrics[] = [];
  for (let i = 0; i < periodRows.length; i++) {
    const p = periodRows[i] as Record<string, unknown>;
    const optReturn = getPeriodReturn(p, "optimizationReturn");
    const valReturn = getPeriodReturn(p, "validationReturn");
    const startDate = (p.startDate ?? p.start_date ?? p.start ?? "") as string;
    const endDate = (p.endDate ?? p.end_date ?? p.end ?? "") as string;
    const dateRange = { start: String(startDate).slice(0, 10), end: String(endDate).slice(0, 10) };
    const isMetrics: WindowMetrics = {
      totalReturn: optReturn,
      sharpeRatio: NaN,
      profitFactor: null,
      maxDrawdown: NaN,
      totalTrades: 0,
      winRate: NaN,
    };
    const validationMaxDD = p.validationMaxDD;
    const oosCurve =
      Array.isArray((transferWindows[i] as Record<string, unknown> | undefined)?.oosEquityCurve) &&
      (transferWindows[i] as Record<string, unknown>).oosEquityCurve;
    let oosMaxDrawdown = NaN;
    if (typeof validationMaxDD === "number" && Number.isFinite(validationMaxDD)) {
      oosMaxDrawdown =
        Math.abs(validationMaxDD) > 1
          ? -Math.abs(validationMaxDD) / 100
          : validationMaxDD <= 0
            ? validationMaxDD
            : -validationMaxDD;
    }
    if (!Number.isFinite(oosMaxDrawdown) && Array.isArray(oosCurve) && oosCurve.length > 1) {
      const balanceCurve = equityCurveToBalanceArray(oosCurve);
      const mddPct = calculateMaxDrawdown(balanceCurve);
      if (Number.isFinite(mddPct)) oosMaxDrawdown = -(mddPct / 100);
    }
    const oosMetrics: WindowMetrics = {
      totalReturn: valReturn,
      sharpeRatio: NaN,
      profitFactor: null,
      maxDrawdown: oosMaxDrawdown,
      totalTrades: 0,
      winRate: NaN,
    };
    const sharpeRetention =
      Number.isFinite(optReturn) && optReturn !== 0 ? (valReturn / optReturn) : null;
    const returnRetention =
      Number.isFinite(optReturn) && optReturn !== 0 ? (valReturn / optReturn) : null;
    out.push({
      window: i + 1,
      dateRange,
      source: "wfa_window",
      isMetrics,
      oosMetrics,
      sharpeRetention,
      returnRetention,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build Risk block from OOSMetrics (Layer 3)
// ---------------------------------------------------------------------------

/**
 * Build riskAnalysis block shape from OOSMetrics so existing consumers keep working.
 */
export function buildRiskBlockFromOOSMetrics(oosMetrics: OOSMetrics | null): RiskAnalysisResult | null {
  if (!oosMetrics) return null;
  const wfaNote =
    oosMetrics.source === "wfa_window_oos" && (oosMetrics.wfaOosWindowCount ?? 0) > 0
      ? "Profit factor, win rate, and gain-to-pain are from WFA OOS period returns, not an OOS trade list."
      : undefined;
  const r: RiskAnalysisResult = {
    maxDrawdown: oosMetrics.maxDrawdown,
    sharpeRatio: oosMetrics.sharpeRatio ?? NaN,
    var: NaN,
    metrics: {
      profitFactor: oosMetrics.profitFactor ?? NaN,
      expectancy: NaN,
      winRate: oosMetrics.winRate,
    },
    recoveryFactor: oosMetrics.recoveryFactor ?? NaN,
    sortinoRatio: NaN,
    expectedShortfall95: NaN,
    gainToPain: oosMetrics.gainToPain ?? NaN,
    skewness: NaN,
    kurtosis: NaN,
    edgeStabilityZScore: NaN,
    durbinWatson: NaN,
    oosWindowCount: oosMetrics.wfaOosWindowCount ?? 0,
  };
  const narr = buildRiskNarratives(r);
  const diagnosticNote = [wfaNote, narr.diagnosticNote].filter((s) => typeof s === "string" && s.length > 0).join(" ");
  return { ...r, ...narr, ...(diagnosticNote ? { diagnosticNote } : {}) };
}
