/**
 * Compute card summary for list views from TestResultData.
 * Pure deterministic mapping (no I/O).
 */

import type { TestResultData } from "@kiploks/engine-contracts";

export type CardVerdict = "ROBUST" | "WATCH" | "FAIL";

export interface AnalyzeCardSummaryRow {
  verdict: CardVerdict;
  robustnessScore: number | null;
  netEdgeBps: number | null;
  tStat: number | null;
  wfe: number | null;
  successProbability: number | null;
  pairTimeframe: string | null;
  timeframe: string | null;
  tradesCount: number | null;
  testPeriod: string | null;
  diagnosis: string | null;
  exchange: string | null;
  /** Max drawdown as a positive percentage for UI (e.g. 15.4 means 15.4%). */
  maxDrawdownPct: number | null;
  /** Win rate in 0–1 when available from backtest results. */
  winRate: number | null;
  recoveryFactor: number | null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickResults(data: TestResultData): Record<string, unknown> | null {
  const d = data as Record<string, unknown>;
  const br = (d.backtestResult ?? d.backtest) as Record<string, unknown> | undefined;
  if (br && typeof br === "object") {
    const r = (br.results ?? br.result) as Record<string, unknown> | undefined;
    if (r && typeof r === "object") return r;
  }
  const top = d.results as Record<string, unknown> | undefined;
  if (top && typeof top === "object") return top;
  return null;
}

/** Normalize win rate to 0–1 (Freqtrade may send percent 0–100). */
function normalizeWinRate(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw > 1 && raw <= 100) return raw / 100;
  if (raw > 100 || raw < 0) return null;
  return raw;
}

/**
 * Max drawdown as positive display percent (15.4 => 15.4%).
 * Accepts decimal fraction (0.154) or already-percent (15.4).
 */
function normalizeMaxDrawdownDisplayPct(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const v = Math.abs(raw);
  if (v <= 1) return v * 100;
  return v;
}

function extractBacktestListMetrics(data: TestResultData): {
  maxDrawdownPct: number | null;
  winRate: number | null;
  recoveryFactor: number | null;
} {
  const results = pickResults(data);
  if (!results) return { maxDrawdownPct: null, winRate: null, recoveryFactor: null };

  const mdRaw = toNum(
    results.max_drawdown ?? results.maxDrawdown ?? results.max_drawdown_abs,
  );
  const maxDrawdownPct = normalizeMaxDrawdownDisplayPct(mdRaw);

  const wrRaw = toNum(results.win_rate ?? results.winrate ?? results.win_rate_pct);
  const winRate = normalizeWinRate(wrRaw);

  const recoveryFactor = toNum(
    results.recovery_factor ?? results.recoveryFactor ?? results.recovery,
  );

  return { maxDrawdownPct, winRate, recoveryFactor };
}

function testPeriodMonths(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  if (!s || !e) return null;
  const startDate = new Date(s);
  const endDate = new Date(e);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const months = Math.round((endDate.getTime() - startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  return months > 0 ? months : null;
}

function formatTestPeriod(start?: string, end?: string): string | null {
  const months = testPeriodMonths(start, end);
  if (months == null) return null;
  if (months < 12) return `${months} months`;
  const years = Math.round(months / 12);
  return years === 1 ? "12 months" : `${years} years`;
}

export function computeAnalyzeCardSummary(data: TestResultData): AnalyzeCardSummaryRow {
  const bc = data.benchmarkComparison as { alphaTStat?: number } | undefined;
  const toc = data.turnoverAndCostDrag as { avgNetProfitPerTradeBps?: number; avgTradesPerMonth?: number } | undefined;
  const wfa = data.walkForwardAnalysis;
  const rs = data.robustnessScore;
  const strategy = data.strategy;

  const robustnessScore = rs?.overall != null ? Math.round(rs.overall) : null;
  const netEdgeBps = toNum(toc?.avgNetProfitPerTradeBps) ?? null;
  const tStat = toNum(bc?.alphaTStat) ?? null;
  const wfe = toNum(wfa?.wfe) ?? null;

  const tNorm = tStat != null ? Math.min(1, Math.max(0, (tStat + 1) / 3)) : 0.5;
  const wfeNorm = wfe != null ? Math.min(1, Math.max(0, wfe)) : 0.5;
  const successProbability = Math.round(tNorm * 50 + wfeNorm * 50);

  const vp = data.verdictPayload as { verdict?: string } | undefined;
  const severity = vp?.verdict;
  let verdict: CardVerdict = "WATCH";
  if (severity === "REJECTED" || severity === "FAIL") {
    verdict = "FAIL";
  } else if (severity === "INCUBATE" || severity === "WATCH") {
    verdict = "WATCH";
  } else if (severity === "ROBUST") {
    verdict = "ROBUST";
  } else if (robustnessScore != null && wfe != null) {
    if (robustnessScore >= 70 && wfe >= 0.5 && (netEdgeBps == null || netEdgeBps > 15)) {
      verdict = "ROBUST";
    } else if (robustnessScore < 40 || wfe < 0.35 || (netEdgeBps != null && netEdgeBps < 0)) {
      verdict = "FAIL";
    }
  }

  const pairTimeframe =
    strategy?.symbol && strategy?.timeframe
      ? `${strategy.symbol} | ${strategy.timeframe}`
      : null;
  const timeframe =
    typeof strategy?.timeframe === "string" && strategy.timeframe.trim()
      ? strategy.timeframe.trim()
      : null;
  const testPeriod = formatTestPeriod(strategy?.testPeriodStart, strategy?.testPeriodEnd) ?? null;
  const periodMonths = testPeriodMonths(strategy?.testPeriodStart, strategy?.testPeriodEnd);
  const tradesCount =
    toc?.avgTradesPerMonth != null && periodMonths != null
      ? Math.round(toc.avgTradesPerMonth * periodMonths)
      : null;

  let diagnosis: string | null = null;
  if (verdict === "ROBUST") diagnosis = "Solid logic, sustainable costs.";
  else if (verdict === "FAIL") diagnosis = "Critical issues; re-optimize or drop.";
  else diagnosis = "Needs attention; check costs and stability.";

  const exchange =
    typeof strategy?.exchange === "string" && strategy.exchange.trim()
      ? strategy.exchange.trim()
      : null;

  const { maxDrawdownPct, winRate, recoveryFactor } = extractBacktestListMetrics(data);

  return {
    verdict,
    robustnessScore,
    netEdgeBps,
    tStat,
    wfe,
    successProbability,
    pairTimeframe,
    timeframe,
    tradesCount,
    testPeriod,
    diagnosis,
    exchange,
    maxDrawdownPct,
    winRate,
    recoveryFactor,
  };
}

