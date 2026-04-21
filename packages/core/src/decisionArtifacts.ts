export type DecisionFlag =
  | "POSITIVE_WFA_STRONG"
  | "POSITIVE_WFA_MODERATE"
  | "POSITIVE_PARAM_STABLE"
  | "POSITIVE_OVERFIT_LOW"
  | "POSITIVE_HIGH_SHARPE"
  | "POSITIVE_PROFIT_FACTOR_HIGH"
  | "POSITIVE_WIN_RATE_HIGH"
  | "POSITIVE_EXPECTANCY_POSITIVE"
  | "POSITIVE_MONTE_CARLO_STABLE"
  | "POSITIVE_REGIME_ROBUST"
  | "POSITIVE_DATA_QUALITY_HIGH"
  | "RISK_LOW_VOL_REGIME"
  | "RISK_CAPACITY_LIMITED"
  | "RISK_HIGH_DRAWDOWN"
  | "RISK_PARAM_SENSITIVE"
  | "RISK_OVERFIT_HIGH"
  | "RISK_LOW_SHARPE"
  | "RISK_NEGATIVE_EXPECTANCY"
  | "RISK_WFA_DEGRADATION"
  | "RISK_REGIME_DEPENDENT"
  | "RISK_SLIPPAGE_SENSITIVE";

export interface DecisionSummary {
  verdict: "ROBUST" | "FRAGILE" | "UNCERTAIN";
  confidence: number;
  riskLevel: "Low" | "Medium" | "High";
  deploymentReadiness: boolean;
  recommendedAllocation?: string;
  positiveFlags: {
    simple: DecisionFlag[];
    pro: DecisionFlag[];
    inst: DecisionFlag[];
  };
  riskFlags: {
    simple: DecisionFlag[];
    pro: DecisionFlag[];
    inst: DecisionFlag[];
  };
}

export interface DecisionLogic {
  verdict: "ROBUST" | "CAUTION" | "NOT RECOMMENDED";
  rules: Array<{
    id: string;
    name: string;
    condition: string;
    passed: boolean;
  }>;
  alternativeVerdicts: {
    caution: {
      conditions: Array<{ name: string; condition: string }>;
    };
    notRecommended: {
      condition: string;
    };
  };
  modifiers: Array<{
    type: "penalty" | "bonus";
    description: string;
    value: string;
  }>;
  auditNote: string;
}

export interface BuildDecisionArtifactsInput {
  robustnessScore?: unknown;
  walkForwardAnalysis?: unknown;
  riskAnalysis?: unknown;
  parameterSensitivity?: unknown;
  turnoverAndCostDrag?: unknown;
  /** Regime pass/fail (e.g. `regimeSurvivalMatrix`) for POSITIVE_REGIME_ROBUST - not the DQG module. */
  proBenchmarkMetrics?: unknown;
  verdictPayload?: unknown;
  strategyActionPlanPrecomputed?: unknown;
}

const FLAG_WEIGHT: Record<DecisionFlag, number> = {
  POSITIVE_WFA_STRONG: 100,
  POSITIVE_WFA_MODERATE: 70,
  POSITIVE_PARAM_STABLE: 90,
  POSITIVE_OVERFIT_LOW: 85,
  POSITIVE_HIGH_SHARPE: 80,
  POSITIVE_PROFIT_FACTOR_HIGH: 75,
  POSITIVE_WIN_RATE_HIGH: 65,
  POSITIVE_EXPECTANCY_POSITIVE: 70,
  POSITIVE_MONTE_CARLO_STABLE: 75,
  POSITIVE_REGIME_ROBUST: 80,
  POSITIVE_DATA_QUALITY_HIGH: 72,
  RISK_LOW_VOL_REGIME: 60,
  RISK_CAPACITY_LIMITED: 70,
  RISK_HIGH_DRAWDOWN: 85,
  RISK_PARAM_SENSITIVE: 75,
  RISK_OVERFIT_HIGH: 90,
  RISK_LOW_SHARPE: 65,
  RISK_NEGATIVE_EXPECTANCY: 95,
  RISK_WFA_DEGRADATION: 80,
  RISK_REGIME_DEPENDENT: 70,
  RISK_SLIPPAGE_SENSITIVE: 65,
};

function toNum(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function prioritizeFlags(flags: DecisionFlag[], maxPositives = 3, maxRisks = 3) {
  const positives = flags.filter((f) => f.startsWith("POSITIVE_"));
  const risks = flags.filter((f) => f.startsWith("RISK_"));
  positives.sort((a, b) => FLAG_WEIGHT[b] - FLAG_WEIGHT[a]);
  risks.sort((a, b) => FLAG_WEIGHT[b] - FLAG_WEIGHT[a]);
  return {
    positives: positives.slice(0, maxPositives),
    risks: risks.slice(0, maxRisks),
  };
}

function evaluateFlags(input: BuildDecisionArtifactsInput): DecisionFlag[] {
  const flags: DecisionFlag[] = [];

  const wfa = (input.walkForwardAnalysis ?? {}) as Record<string, unknown>;
  const risk = (input.riskAnalysis ?? {}) as Record<string, unknown>;
  const ps = (input.parameterSensitivity ?? {}) as Record<string, unknown>;
  const toc = (input.turnoverAndCostDrag ?? {}) as Record<string, unknown>;
  const robustness = (input.robustnessScore ?? {}) as Record<string, unknown>;

  const consistency = toNum(wfa.consistency);
  if (consistency != null) {
    if (consistency >= 0.75) flags.push("POSITIVE_WFA_STRONG");
    else if (consistency >= 0.6) flags.push("POSITIVE_WFA_MODERATE");
    else if (consistency < 0.5) flags.push("RISK_WFA_DEGRADATION");
  }

  const overfit = toNum((wfa.overfittingRisk as Record<string, unknown> | undefined)?.score);
  if (overfit != null) {
    if (overfit <= 0.2) flags.push("POSITIVE_OVERFIT_LOW");
    if (overfit > 0.3) flags.push("RISK_OVERFIT_HIGH");
  }

  const sharpe = toNum(risk.sharpeRatio);
  if (sharpe != null) {
    if (sharpe >= 2) flags.push("POSITIVE_HIGH_SHARPE");
    if (sharpe < 1) flags.push("RISK_LOW_SHARPE");
  }

  const pf = toNum((risk.metrics as Record<string, unknown> | undefined)?.profitFactor ?? risk.profitFactor);
  if (pf != null && pf >= 2) flags.push("POSITIVE_PROFIT_FACTOR_HIGH");

  const winRate = toNum((risk.metrics as Record<string, unknown> | undefined)?.winRate ?? risk.winRate);
  if (winRate != null && winRate >= 0.55) flags.push("POSITIVE_WIN_RATE_HIGH");

  const expectancy = toNum((risk.metrics as Record<string, unknown> | undefined)?.expectancy ?? risk.expectancy);
  if (expectancy != null) {
    if (expectancy > 0) flags.push("POSITIVE_EXPECTANCY_POSITIVE");
    else flags.push("RISK_NEGATIVE_EXPECTANCY");
  }

  const maxDD = toNum(risk.maxDrawdown);
  if (maxDD != null && maxDD > 0.2) flags.push("RISK_HIGH_DRAWDOWN");

  const stabilityRaw = toNum((ps.diagnostics as Record<string, unknown> | undefined)?.parameterStabilityIndex);
  if (stabilityRaw != null) {
    const stability = stabilityRaw > 1 ? stabilityRaw / 100 : stabilityRaw;
    if (stability >= 0.8) flags.push("POSITIVE_PARAM_STABLE");
    if (stability < 0.6) flags.push("RISK_PARAM_SENSITIVE");
  }

  const dataQuality = toNum((robustness.modules as Record<string, unknown> | undefined)?.dataQuality);
  if (dataQuality != null) {
    if (dataQuality >= 75) flags.push("POSITIVE_DATA_QUALITY_HIGH");
    if (dataQuality < 40) flags.push("RISK_REGIME_DEPENDENT");
  }

  const pro = (input.proBenchmarkMetrics ?? {}) as Record<string, unknown>;
  const regimeMatrix = pro.regimeSurvivalMatrix as
    | Record<string, { pass?: boolean; fragile?: boolean; fail?: boolean }>
    | undefined;
  if (regimeMatrix && typeof regimeMatrix === "object") {
    const passCount = Object.values(regimeMatrix).filter((cell) => cell && cell.pass === true).length;
    if (passCount >= 1) flags.push("POSITIVE_REGIME_ROBUST");
  }

  const slippageStatus = String(toc.breakevenStatus ?? "");
  if (slippageStatus === "CRITICAL" || slippageStatus === "FRAGILE") {
    flags.push("RISK_SLIPPAGE_SENSITIVE");
  }

  const cap = toNum((toc.capacity as Record<string, unknown> | undefined)?.alphaMinus10Aum);
  if (cap != null && cap < 100000) {
    flags.push("RISK_CAPACITY_LIMITED");
  }

  return Array.from(new Set(flags));
}

export function buildDecisionArtifacts(input: BuildDecisionArtifactsInput): {
  decisionSummary: DecisionSummary;
  decisionLogic: DecisionLogic;
} {
  const verdictPayload = (input.verdictPayload ?? {}) as Record<string, unknown>;
  const finalLabel = String(verdictPayload.finalVerdictLabel ?? "");
  const strategyActionPlan = (input.strategyActionPlanPrecomputed ?? {}) as Record<string, unknown>;

  const flags = evaluateFlags(input);
  const prioritized = prioritizeFlags(flags);
  const hasCriticalRisk =
    prioritized.risks.includes("RISK_NEGATIVE_EXPECTANCY") ||
    prioritized.risks.includes("RISK_OVERFIT_HIGH") ||
    prioritized.risks.includes("RISK_WFA_DEGRADATION");

  const robustnessScoreRec = (input.robustnessScore ?? {}) as Record<string, unknown>;
  const robustnessOverall = toNum(robustnessScoreRec.overall);
  const blockedByModule = String(robustnessScoreRec.blockedByModule ?? "");
  const blockedByModulesRaw = robustnessScoreRec.blockedByModules;
  const blockedByModules = Array.isArray(blockedByModulesRaw) ? (blockedByModulesRaw as unknown[]) : [];
  const scoreBlocked =
    (robustnessOverall ?? 0) === 0 ||
    blockedByModule.length > 0 ||
    blockedByModules.length > 0;

  const engineVerdict = String(verdictPayload.verdict ?? "").toUpperCase();

  let decisionVerdict: "ROBUST" | "CAUTION" | "NOT RECOMMENDED";
  if (engineVerdict === "FAIL" || engineVerdict === "REJECTED") {
    decisionVerdict = "NOT RECOMMENDED";
  } else if (engineVerdict === "INCUBATE" || engineVerdict === "WATCH") {
    decisionVerdict = "CAUTION";
  } else if (engineVerdict === "ROBUST") {
    decisionVerdict = "ROBUST";
  } else if (finalLabel === "DO NOT DEPLOY") {
    decisionVerdict = "NOT RECOMMENDED";
  } else if (finalLabel === "CAUTION") {
    decisionVerdict = "CAUTION";
  } else if (finalLabel === "ROBUST") {
    decisionVerdict = "ROBUST";
  } else if (hasCriticalRisk) {
    decisionVerdict = "NOT RECOMMENDED";
  } else if (prioritized.positives.length >= 2 && prioritized.risks.length <= 1) {
    decisionVerdict = "ROBUST";
  } else {
    decisionVerdict = "CAUTION";
  }

  if (scoreBlocked) {
    decisionVerdict = "NOT RECOMMENDED";
  }
  const baseConfidence = robustnessOverall != null ? clamp(robustnessOverall / 100, 0.1, 0.99) : 0.55;
  const confidencePenalty = prioritized.risks.length * 0.06;
  const confidenceBonus = prioritized.positives.length * 0.04;
  const confidence = clamp(baseConfidence + confidenceBonus - confidencePenalty, 0.1, 0.99);

  let riskLevel: "Low" | "Medium" | "High" = "Medium";
  if (decisionVerdict === "NOT RECOMMENDED" || prioritized.risks.length >= 3) riskLevel = "High";
  else if (decisionVerdict === "ROBUST" && prioritized.risks.length === 0) riskLevel = "Low";

  const summaryVerdict: "ROBUST" | "FRAGILE" | "UNCERTAIN" =
    decisionVerdict === "ROBUST" ? "ROBUST" : decisionVerdict === "NOT RECOMMENDED" ? "FRAGILE" : "UNCERTAIN";

  const allocationText = strategyActionPlan.allocationText;
  const recommendedAllocation = typeof allocationText === "string" && allocationText.trim().length > 0
    ? allocationText
    : summaryVerdict === "ROBUST"
      ? riskLevel === "Low" ? "$50k-$100k" : "$25k-$50k"
      : undefined;

  const deploymentGate = verdictPayload.deploymentGate as Array<Record<string, unknown>> | undefined;
  const rules: DecisionLogic["rules"] = Array.isArray(deploymentGate) && deploymentGate.length > 0
    ? deploymentGate.map((item, idx) => ({
      id: `gate-${idx + 1}`,
      name: String(item.label ?? `Gate ${idx + 1}`),
      condition: `${String(item.label ?? `Gate ${idx + 1}`)} threshold`,
      passed: item.notApplicable === true || item.passed === true,
    }))
    : [
      {
        id: "robustness",
        name: "Robustness Score",
        condition: "Robustness score >= 70",
        passed: (robustnessOverall ?? 0) >= 70,
      },
      {
        id: "wfa-consistency",
        name: "WFA consistency",
        condition: "WFA consistency >= 0.60",
        passed: (toNum(((input.walkForwardAnalysis ?? {}) as Record<string, unknown>).consistency) ?? 0) >= 0.6,
      },
      {
        id: "risk-floor",
        name: "Risk floor",
        condition: "Sharpe >= 1.0 and no critical expectancy risk",
        passed: (toNum(((input.riskAnalysis ?? {}) as Record<string, unknown>).sharpeRatio) ?? 0) >= 1 &&
          !prioritized.risks.includes("RISK_NEGATIVE_EXPECTANCY"),
      },
    ];

  const modifiers: DecisionLogic["modifiers"] = [];
  if (blockedByModule.length > 0) {
    modifiers.push({
      type: "penalty",
      description: `Critical block: ${blockedByModule}`,
      value: "-1 verdict level",
    });
  }
  if (strategyActionPlan.systemConflictDetected === true) {
    modifiers.push({
      type: "penalty",
      description: "System conflict between retention and stability",
      value: "-0.10 confidence",
    });
  }
  if (decisionVerdict === "ROBUST" && confidence >= 0.8) {
    modifiers.push({
      type: "bonus",
      description: "Strong aggregate signal quality",
      value: "+0.05 confidence",
    });
  }

  const decisionSummary: DecisionSummary = {
    verdict: summaryVerdict,
    confidence,
    riskLevel,
    deploymentReadiness: decisionVerdict === "ROBUST" && confidence >= 0.7,
    recommendedAllocation,
    positiveFlags: {
      simple: prioritized.positives,
      pro: [],
      inst: [],
    },
    riskFlags: {
      simple: prioritized.risks,
      pro: [],
      inst: [],
    },
  };

  const decisionLogic: DecisionLogic = {
    verdict: decisionVerdict,
    rules,
    alternativeVerdicts: {
      caution: {
        conditions: [
          { name: "robustness", condition: "Robustness score >= 55" },
          { name: "risk", condition: "No hard reject gates triggered" },
        ],
      },
      notRecommended: {
        condition: "Any hard reject or critical quality/risk block",
      },
    },
    modifiers,
    auditNote: "Generated in engine-core decisionArtifacts v1.0 (deterministic, host-owned).",
  };

  return { decisionSummary, decisionLogic };
}
