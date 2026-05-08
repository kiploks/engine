/**
 * Zone A: normalize raw integration payload before report math.
 * snake_case keys, percent-to-decimal for returns. See docs/PLAN_IMMUTABLE_ANALYTICS_PIPE.md.
 */

import type {
  IntegrationPayloadRaw,
  UnifiedIntegrationPayload,
} from "@kiploks/engine-contracts";
import { toDecimalReturn } from "./normalize";

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function normalizePeriodReturnValue(
  primaryRaw: unknown,
  metricsRaw: unknown,
): number {
  const primaryNum = toFiniteNumber(primaryRaw);
  const metricsNum = toFiniteNumber(metricsRaw);
  const primaryNorm = toDecimalReturn(primaryNum);
  const metricsNorm = toDecimalReturn(metricsNum);

  if (Number.isFinite(primaryNorm) && Number.isFinite(metricsNorm)) {
    /**
     * Prefer metrics return when it is materially larger than shorthand return.
     * This aligns local integration payloads with cloud snapshots where metrics.*.totalReturn
     * can contain the canonical period return while shorthand fields are reduced.
     */
    if (Math.abs(metricsNorm) >= Math.max(0.1, Math.abs(primaryNorm) * 10)) {
      return metricsNorm;
    }
    /**
     * Ambiguous zone: values in (1,5] can be either 1-5% or 100-500% decimal return.
     * If shorthand value is tiny and metrics value is much larger, keep metrics as decimal.
     */
    if (
      metricsNum != null &&
      Math.abs(metricsNum) > 1 &&
      Math.abs(metricsNum) <= 5 &&
      Math.abs(primaryNorm) < 0.05 &&
      Math.abs(metricsNum) >= Math.max(0.5, Math.abs(primaryNorm) * 20)
    ) {
      return metricsNum;
    }
    return primaryNorm;
  }

  if (Number.isFinite(primaryNorm)) return primaryNorm;
  if (Number.isFinite(metricsNorm)) return metricsNorm;
  return Number.NaN;
}

/**
 * Normalizes a payload (e.g. Freqtrade or generic integration) so downstream logic
 * receives canonical keys and decimal returns.
 * Shallow-copies the root and nested backtest / WFA objects that are normalized.
 */
export function mapPayloadToUnified(
  payload: IntegrationPayloadRaw,
): UnifiedIntegrationPayload {
  const out = { ...payload } as UnifiedIntegrationPayload;

  const backtest =
    (out.backtestResult ?? out.backtest) as Record<string, unknown> | undefined;
  if (backtest && typeof backtest === "object") {
    const results = backtest.results as Record<string, unknown> | undefined;
    if (results && typeof results === "object") {
      const totalTrades = results.totalTrades ?? results.total_trades;
      const rawReturn =
        results.totalReturn ??
        results.profit_total ??
        results.profit_total_pct;
      const totalReturn =
        typeof rawReturn === "number" && Number.isFinite(rawReturn)
          ? toDecimalReturn(rawReturn)
          : rawReturn;
      const totalTradesNumber =
        totalTrades !== undefined ? Number(totalTrades) : undefined;
      (out.backtestResult as Record<string, unknown>) = {
        ...backtest,
        results: {
          ...results,
          ...(totalTradesNumber !== undefined &&
          Number.isFinite(totalTradesNumber)
            ? { totalTrades: totalTradesNumber }
            : {}),
          ...(totalReturn !== undefined && { totalReturn }),
        },
      };
      if (out.backtest === backtest) {
        out.backtest = out.backtestResult;
      }
    }
  }

  const wfa = (out.walkForwardAnalysis ??
    out.wfaData ??
    out.wfaResult) as Record<string, unknown> | undefined;
  if (wfa && typeof wfa === "object") {
    const periods = (wfa.periods ?? wfa.windows) as unknown[] | undefined;
    if (Array.isArray(periods) && periods.length > 0) {
      const normalizedPeriods = periods.map((p) => {
        const rec = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        const m = rec.metrics as Record<string, Record<string, unknown>> | undefined;
        const opt = m?.optimization;
        const val = m?.validation;
        const rawOpt =
          rec.optimizationReturn ??
          rec.optimization_return ??
          (opt && typeof opt === "object" ? (opt.totalReturn ?? opt.total) : undefined);
        const rawVal =
          rec.validationReturn ??
          rec.validation_return ??
          (val && typeof val === "object" ? (val.totalReturn ?? val.total) : undefined);
        return {
          ...rec,
          optimizationReturn: normalizePeriodReturnValue(
            rec.optimizationReturn ?? rec.optimization_return,
            opt && typeof opt === "object" ? (opt.totalReturn ?? opt.total) : undefined,
          ),
          validationReturn: normalizePeriodReturnValue(
            rec.validationReturn ?? rec.validation_return,
            val && typeof val === "object" ? (val.totalReturn ?? val.total) : undefined,
          ),
        };
      });
      const key = wfa.periods ? "periods" : "windows";
      (out.walkForwardAnalysis as Record<string, unknown>) = {
        ...wfa,
        [key]: normalizedPeriods,
      };
      if (out.wfaData === wfa) out.wfaData = out.walkForwardAnalysis;
      if (out.wfaResult === wfa) out.wfaResult = out.walkForwardAnalysis;
    }
  }

  return out;
}
