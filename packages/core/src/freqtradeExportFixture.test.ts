import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestResultDataFromUnified } from "./buildTestResultDataFromUnified";
import { mapPayloadToUnified } from "./mapPayloadToUnified";

/**
 * Golden path: same shape as POST /api/integration/results (Freqtrade export).
 * File lives in private-core-saas (large JSON with trades + WFA + hyperopt).
 */
const FIXTURE = join(
  process.cwd(),
  "../../../private-core-saas/kiploks-freqtrade-data/export_freqtrade_result.json",
);

describe("export_freqtrade_result.json → TestResultData", () => {
  it.skipIf(!existsSync(FIXTURE))("produces aligned verdicts (REJECTED/FAIL vs decision layer)", () => {
      const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as { results?: unknown[] };
      const first = raw.results?.[0];
      expect(first).toBeTruthy();
      const row = first as Record<string, unknown>;
      const strategyName =
        typeof (row.parameters as Record<string, unknown> | undefined)?.strategy === "string"
          ? ((row.parameters as Record<string, unknown>).strategy as string)
          : "SampleStrategy";

      const unified = mapPayloadToUnified({
        ...row,
        id: "fixture_freqtrade_export",
        strategy: {
          name: strategyName,
          symbol: "BTCUSDT",
          timeframe: "1h",
          exchange: "binance",
        },
      });
      const report = buildTestResultDataFromUnified(unified, "fixture_freqtrade_export");
      expect(report).not.toBeNull();
      if (!report) return;

      const vp = report.verdictPayload as { verdict?: string } | undefined;
      const ds = report.decisionSummary;
      const dl = report.decisionLogic;

      expect(vp?.verdict, "verdictPayload.verdict present").toBeTruthy();

      if (vp?.verdict === "REJECTED" || vp?.verdict === "FAIL") {
        expect(ds?.verdict).toBe("FRAGILE");
        expect(dl?.verdict).toBe("NOT RECOMMENDED");
      }

      const rs = report.robustnessScore as { overall?: number; blockedByModule?: string } | undefined;
      if ((rs?.overall ?? 1) === 0 || (rs?.blockedByModule != null && String(rs.blockedByModule).length > 0)) {
        expect(dl?.verdict).toBe("NOT RECOMMENDED");
        expect(ds?.verdict).toBe("FRAGILE");
      }

      const positives = ds?.positiveFlags?.simple ?? [];
      if (!positives.includes("POSITIVE_REGIME_ROBUST")) {
        return;
      }
      const pro = report.proBenchmarkMetrics as { regimeSurvivalMatrix?: Record<string, { pass?: boolean }> } | null;
      const matrix = pro?.regimeSurvivalMatrix;
      if (matrix) {
        const passCount = Object.values(matrix).filter((c) => c?.pass === true).length;
        expect(passCount).toBeGreaterThan(0);
      }
    });
});
