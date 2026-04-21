import { describe, expect, it } from "vitest";
import {
  aggregateOOSFromWFAWindows,
  buildRiskBlockFromOOSMetrics,
  buildWFAWindowMetrics,
  computeOOSMetricsFromTrades,
  computeFullBacktestMetrics,
  mapPayloadRiskToOOSMetrics,
  wfaRowsForMetrics,
} from "./canonicalMetrics";

describe("canonicalMetrics", () => {
  it("normalizes percent totalReturn in full backtest metrics", () => {
    const out = computeFullBacktestMetrics({
      results: {
        totalReturn: 25,
        totalTrades: 10,
        winRate: 55,
        profitFactor: 1.2,
      },
      config: {
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        symbol: "BTC/USDT",
        timeframe: "1h",
      },
    });

    expect(out?.totalReturn).toBe(0.25);
    expect(out?.totalTrades).toBe(10);
  });

  it("aggregates OOS metrics from WFA windows", () => {
    const out = aggregateOOSFromWFAWindows(
      [
        { validationReturn: 0.05 },
        { validationReturn: -0.02 },
        { validationReturn: 0.03 },
      ],
      1000,
    );
    expect(out).not.toBeNull();
    expect(out?.source).toBe("wfa_window_oos");
    expect(out?.wfaOosWindowCount).toBe(3);
  });

  it("maps payload risk block to OOS metrics", () => {
    const out = mapPayloadRiskToOOSMetrics(
      {
        maxDrawdown: -0.2,
        sharpeRatio: 1.1,
        recoveryFactor: 2,
        metrics: { winRate: 0.55, profitFactor: 1.4 },
      },
      1000,
    );
    expect(out).not.toBeNull();
    expect(out?.source).toBe("payload");
    expect(out?.profitFactor).toBe(1.4);
  });

  it("builds per-window metrics from WFA windows when periods missing", () => {
    const out = buildWFAWindowMetrics({
      windows: [
        { optimizationReturn: 0.1, validationReturn: 0.04, startDate: "2024-01-01", endDate: "2024-06-01" },
        { optimizationReturn: 0.11, validationReturn: 0.05, startDate: "2024-07-01", endDate: "2024-12-31" },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.source).toBe("wfa_window");
  });

  it("builds per-window metrics from WFA periods", () => {
    const out = buildWFAWindowMetrics({
      periods: [{ optimizationReturn: 0.1, validationReturn: 0.04, startDate: "2024-01-01", endDate: "2024-06-01" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("wfa_window");
    expect(out[0]?.oosMetrics?.totalReturn).toBe(0.04);
  });

  it("wfaRowsForMetrics prefers periods over windows when both exist", () => {
    const rows = wfaRowsForMetrics({
      periods: [{ a: 1 }],
      windows: [{ b: 2 }],
    });
    expect(rows).toEqual([{ a: 1 }]);
  });

  it("exposes wfaOosWindowCount and diagnosticNote on risk block from WFA OOS", () => {
    const oos = aggregateOOSFromWFAWindows([{ validationReturn: 0.01 }, { validationReturn: -0.02 }], 1000);
    expect(oos?.wfaOosWindowCount).toBe(2);
    const risk = buildRiskBlockFromOOSMetrics(oos!);
    expect(risk?.oosWindowCount).toBe(2);
    expect(String(risk?.diagnosticNote)).toContain("WFA OOS period");
  });

  it("keeps gainToPain from profitFactor-1 when payload gainToPain is missing", () => {
    const out = mapPayloadRiskToOOSMetrics(
      {
        maxDrawdown: -0.2,
        recoveryFactor: 2,
        metrics: { winRate: 0.5, profitFactor: 1.8 },
      },
      1000,
    );
    expect(out).not.toBeNull();
    expect(out?.gainToPain).toBeCloseTo(0.8, 8);
  });

  it("builds non-empty OOS metrics from trades and maps to risk block", () => {
    const oos = computeOOSMetricsFromTrades(
      [
        { pnl: 30 },
        { pnl: -10 },
        { pnl: 15 },
        { pnl: -5 },
      ] as never,
      1000,
    );
    expect(oos).not.toBeNull();
    const risk = buildRiskBlockFromOOSMetrics(oos);
    expect(risk).not.toBeNull();
    expect(typeof risk?.maxDrawdown).toBe("number");
  });
});
