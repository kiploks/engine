import { describe, expect, it } from "vitest";
import { buildDecisionArtifacts } from "./decisionArtifacts";

describe("buildDecisionArtifacts", () => {
  it("prefers verdictPayload.verdict over flag heuristics when engine says REJECTED", () => {
    const { decisionSummary, decisionLogic } = buildDecisionArtifacts({
      verdictPayload: {
        verdict: "REJECTED",
        deploymentGate: [{ label: "Statistical Significance", passed: false, gateType: "hard" }],
      },
      robustnessScore: { overall: 0, blockedByModule: "validation", modules: { validation: 0, risk: 70 } },
      walkForwardAnalysis: { consistency: 0.8 },
      riskAnalysis: { sharpeRatio: 2.2, metrics: { profitFactor: 2.1, winRate: 0.56, expectancy: 0.1 } },
      parameterSensitivity: { diagnostics: { parameterStabilityIndex: 0.85 } },
      turnoverAndCostDrag: {},
    });
    expect(decisionLogic.verdict).toBe("NOT RECOMMENDED");
    expect(decisionSummary.verdict).toBe("FRAGILE");
  });

  it("downgrades any heuristic verdict when robustness is hard-blocked (not only ROBUST)", () => {
    const { decisionSummary, decisionLogic } = buildDecisionArtifacts({
      verdictPayload: {},
      robustnessScore: { overall: 0, blockedByModule: "validation" },
      walkForwardAnalysis: { consistency: 0.55, overfittingRisk: { score: 0.1 } },
      riskAnalysis: { sharpeRatio: 0.6, metrics: { profitFactor: 0.5, winRate: 0.3 } },
      parameterSensitivity: { diagnostics: { parameterStabilityIndex: 0.85 } },
      turnoverAndCostDrag: {},
    });
    expect(decisionLogic.verdict).toBe("NOT RECOMMENDED");
    expect(decisionSummary.verdict).toBe("FRAGILE");
  });

  it("downgrades strong-positive heuristics to NOT RECOMMENDED when score is blocked", () => {
    const { decisionSummary, decisionLogic } = buildDecisionArtifacts({
      verdictPayload: {},
      robustnessScore: { overall: 0, blockedByModule: "validation" },
      walkForwardAnalysis: { consistency: 0.8, overfittingRisk: { score: 0.1 } },
      riskAnalysis: { sharpeRatio: 2.2, metrics: { profitFactor: 2.1, winRate: 0.56, expectancy: 0.1 } },
      parameterSensitivity: { diagnostics: { parameterStabilityIndex: 0.85 } },
      turnoverAndCostDrag: {},
    });
    expect(decisionLogic.verdict).toBe("NOT RECOMMENDED");
    expect(decisionSummary.verdict).toBe("FRAGILE");
  });
});
