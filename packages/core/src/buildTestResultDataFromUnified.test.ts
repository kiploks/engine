import { describe, expect, it } from "vitest";
import { buildTestResultDataFromUnified } from "./buildTestResultDataFromUnified";
import { runProfessionalWfa } from "./wfaProfessional";
import { validateReportInvariants } from "./validateReportInvariants";

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    strategy: {
      id: "s1",
      name: "demo",
      symbol: "BTCUSDT",
      timeframe: "1h",
      exchange: "binance",
    },
    backtestResult: {
      config: {
        symbol: "BTCUSDT",
        timeframe: "1h",
        exchange: "binance",
        initialBalance: 1000,
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      },
      results: {
        symbol: "BTCUSDT",
        totalTrades: 48,
        totalReturn: 0.25,
        annualizedReturn: 0.25,
        maxDrawdown: -0.2,
        sharpeRatio: 1.1,
        winRate: 0.55,
        profitFactor: 1.3,
      },
      trades: [
        { timestamp: 1704067200000, side: "BUY", price: 100, quantity: 1, symbol: "BTC/USDT", pnl: 2 },
        { timestamp: 1704070800000, side: "SELL", price: 102, quantity: 1, symbol: "BTC/USDT", pnl: 2 },
      ],
    },
    walkForwardAnalysis: {
      periods: [
        {
          optimizationReturn: 0.12,
          validationReturn: 0.08,
          startDate: "2024-01-01",
          endDate: "2024-04-30",
        },
        {
          optimizationReturn: 0.1,
          validationReturn: 0.06,
          startDate: "2024-05-01",
          endDate: "2024-08-31",
        },
        {
          optimizationReturn: 0.08,
          validationReturn: 0.04,
          startDate: "2024-09-01",
          endDate: "2024-12-31",
        },
      ],
      failedWindows: { count: 0, total: 3 },
    },
    ...overrides,
  };
}

describe("buildTestResultDataFromUnified", () => {
  it("returns null when symbol is missing", () => {
    const payload = makePayload({
      strategy: { name: "demo", symbol: "", timeframe: "1h" },
      backtestResult: { config: {}, results: { totalTrades: 10 } },
    });
    const out = buildTestResultDataFromUnified(payload as never, "r1");
    expect(out).toBeNull();
  });

  it("builds report and normalizes symbol", () => {
    const out = buildTestResultDataFromUnified(makePayload() as never, "r1");
    expect(out).not.toBeNull();
    expect(out?.strategy?.symbol).toBe("BTC/USDT");
    expect(out?.verdictPayload).toBeDefined();
  });

  it("derives test period from WFA when top-level dates are absent", () => {
    const payload = makePayload({
      dateFrom: "",
      dateTo: "",
      backtestResult: {
        config: { symbol: "BTCUSDT", timeframe: "1h", exchange: "binance", initialBalance: 1000 },
        results: { symbol: "BTCUSDT", totalTrades: 36, totalReturn: 0.2 },
        trades: [
          { timestamp: 1704067200000, side: "BUY", price: 100, quantity: 1, symbol: "BTC/USDT", pnl: 1 },
          { timestamp: 1704070800000, side: "SELL", price: 101, quantity: 1, symbol: "BTC/USDT", pnl: 1 },
        ],
      },
    });
    const out = buildTestResultDataFromUnified(payload as never, "r1");
    expect(out?.strategy?.testPeriodStart).toBe("2024-01-01");
    expect(out?.strategy?.testPeriodEnd).toBe("2024-12-31");
  });

  it("creates fallback WFA and still returns report when WFA is missing", () => {
    const payload = makePayload({
      walkForwardAnalysis: undefined,
      wfaData: undefined,
      wfaResult: undefined,
    });
    const out = buildTestResultDataFromUnified(payload as never, "r1");
    expect(out).not.toBeNull();
    expect(out?.walkForwardAnalysis).toBeDefined();
    expect(out?.verdictPayload).toBeDefined();
  });

  it("Layer 2.5 uses WFA windows when periods absent (OOS rows + pro sumOos + invariants)", () => {
    const wfaOnlyWindows = {
      windows: [
        { optimizationReturn: 0.12, validationReturn: 0.08, startDate: "2024-01-01", endDate: "2024-04-30" },
        { optimizationReturn: 0.1, validationReturn: 0.06, startDate: "2024-05-01", endDate: "2024-08-31" },
        { optimizationReturn: 0.08, validationReturn: 0.04, startDate: "2024-09-01", endDate: "2024-12-31" },
      ],
      failedWindows: { count: 0, total: 3 },
    };
    const out = buildTestResultDataFromUnified(
      makePayload({ walkForwardAnalysis: wfaOnlyWindows, oos_trades: [] }) as never,
      "r1",
    );
    expect(out).not.toBeNull();
    const pro = out?.proBenchmarkMetrics as { sumOos?: number } | undefined;
    expect(pro?.sumOos).toBeCloseTo(0.08 + 0.06 + 0.04, 8);
    const inv = validateReportInvariants(out as never);
    expect(inv.ok).toBe(true);
  });

  it("marks robustness as dataQuality-blocked on insufficient sample", () => {
    const payload = makePayload({
      backtestResult: {
        config: {
          symbol: "BTCUSDT",
          timeframe: "1h",
          exchange: "binance",
          initialBalance: 1000,
          startDate: "2024-01-01",
          endDate: "2024-01-20",
        },
        results: {
          symbol: "BTCUSDT",
          totalTrades: 5,
          totalReturn: 0.1,
          annualizedReturn: 0.1,
          maxDrawdown: -0.1,
          sharpeRatio: 0.8,
          winRate: 0.5,
          profitFactor: 1.1,
        },
        trades: [
          { timestamp: 1704067200000, side: "BUY", price: 100, quantity: 1, symbol: "BTC/USDT", pnl: 1 },
          { timestamp: 1704070800000, side: "SELL", price: 101, quantity: 1, symbol: "BTC/USDT", pnl: 1 },
        ],
      },
      walkForwardAnalysis: {
        periods: [
          { optimizationReturn: 0.1, validationReturn: 0.01, startDate: "2024-01-01", endDate: "2024-01-10" },
          { optimizationReturn: 0.08, validationReturn: 0.0, startDate: "2024-01-11", endDate: "2024-01-20" },
        ],
        failedWindows: { count: 1, total: 2 },
      },
    });
    const out = buildTestResultDataFromUnified(payload as never, "r1");
    expect(out).not.toBeNull();
    expect(
      (out?.robustnessScore as { blockedByModule?: string } | undefined)?.blockedByModule,
    ).toBe("dataQuality");
    const scenarioTable = (out?.verdictPayload as { scenarioTable?: Array<{ scenario?: string }> } | undefined)?.scenarioTable ?? [];
    expect((scenarioTable[0] ?? {}).scenario).toBe("Data Quality Guard");
  });

  it("preserves submit-time institutional cap (runProfessionalWfa) at read time without duplicate investability mutation", () => {
    const periods = [
      { optimizationReturn: -0.01, validationReturn: -0.04, startDate: "2024-01-01", endDate: "2024-03-31" },
      { optimizationReturn: 0.018, validationReturn: 0.023, startDate: "2024-04-01", endDate: "2024-06-30" },
      { optimizationReturn: 0.009, validationReturn: 0.029, startDate: "2024-07-01", endDate: "2024-09-30" },
      { optimizationReturn: -0.047, validationReturn: -0.04, startDate: "2024-10-01", endDate: "2024-12-31" },
      { optimizationReturn: 0.012, validationReturn: -0.049, startDate: "2025-01-01", endDate: "2025-03-31" },
      { optimizationReturn: -0.082, validationReturn: -0.04, startDate: "2025-04-01", endDate: "2025-06-30" },
    ];
    const pro = runProfessionalWfa({ periods } as never);
    expect(pro).not.toBeNull();
    expect(pro!.professional.institutionalGrade).toBe("BBB - RESEARCH ONLY");
    expect(pro!.professional.institutionalGradeOverride?.code).toBe("FAIL_VERDICT_HIGH_FAILURE_RATE");

    const payload = makePayload({
      walkForwardAnalysis: {
        periods,
        failedWindows: { count: 4, total: 6 },
        windows: [],
        performanceTransfer: { windows: [] },
        professional: pro!.professional,
        professionalMeta: pro!.professionalMeta,
      },
    });
    const out = buildTestResultDataFromUnified(payload as never, "r1");
    expect(out).not.toBeNull();
    const wfa = out?.walkForwardAnalysis as { professional?: { institutionalGrade?: string; institutionalGradeOverride?: { code?: string } } };
    expect(wfa?.professional?.institutionalGrade).toBe("BBB - RESEARCH ONLY");
    expect(wfa?.professional?.institutionalGradeOverride?.code).toBe("FAIL_VERDICT_HIGH_FAILURE_RATE");
    expect((out?.verdictPayload as { verdict?: string })?.verdict).toBe("FAIL");
  });
});
