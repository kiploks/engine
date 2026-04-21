import type { LocalReportDetails, TestResultDataLite } from "./types";
import { normalizeReportForBlockView } from "./reportDisplayNormalize";

type MapResult = {
  lite: TestResultDataLite | null;
  issues: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** SaaS / legacy reports store integrity under `dataIntegrityCheck`; blocks UI expects `dataQualityGuardResult`. */
function dataIntegrityCheckToGuard(src: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!src) return null;
  const scoreRaw = src.dataQualityScore ?? src.finalScore;
  const score = typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? scoreRaw : undefined;
  const la = typeof src.lookAheadBias === "string" ? src.lookAheadBias : "";
  const verdict = /PASS/i.test(la) || (score != null && score >= 85) ? "PASS" : "REVIEW";
  const parts = [typeof src.missingData === "string" ? src.missingData : null, typeof src.survivorshipBias === "string" ? src.survivorshipBias : null].filter(
    Boolean,
  ) as string[];
  return {
    finalScore: score,
    verdict,
    ...(parts.length ? { diagnosis: parts.join("; ") } : {}),
    ...(score != null ? { factor: Math.min(1, score / 100), contribution: Math.round(score * 0.25) } : {}),
    robustNetEdge: "Integrity snapshot from dataIntegrityCheck (mapped for UI).",
    modules: [],
  };
}

/** When `strategyActionPlan` is absent, lift key fields from `deploymentRecommendation` (integration shape). */
function deploymentRecommendationToActionPlan(
  src: Record<string, unknown> | null,
  opts: { baseSharpe?: number; wfeAllWindows?: number; wfaWindows?: number },
): Record<string, unknown> | null {
  if (!src) return null;
  const alloc = asRecord(src.recommendedAllocation);
  const pilot = typeof alloc?.pilot === "string" ? alloc.pilot : undefined;
  const monitoring = Array.isArray(src.monitoringFocus) ? (src.monitoringFocus as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  const exits = Array.isArray(src.exitStopConditions) ? (src.exitStopConditions as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const next = Array.isArray(src.nextSteps) ? (src.nextSteps as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const useCases = Array.isArray(src.useCase) ? (src.useCase as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return {
    ...(opts.baseSharpe != null ? { baseSharpe: opts.baseSharpe } : {}),
    ...(opts.wfeAllWindows != null ? { wfeAllWindows: opts.wfeAllWindows } : {}),
    ...(opts.wfaWindows != null ? { wfaWindows: opts.wfaWindows } : {}),
    phase1Status: typeof src.status === "string" ? src.status : undefined,
    allocationPlan: pilot,
    ...(monitoring.length ? { monitoringPlan: monitoring.join("; ") } : {}),
    killSwitchStatus: "ARMED",
    phase2Status: typeof src.statusPhase === "string" ? src.statusPhase : undefined,
    ...(exits.length ? { phase2Note: exits[0] } : {}),
    ...(useCases.length ? { bullCase: useCases[0] } : {}),
    ...(src.deploymentConstraints != null
      ? { bearCaseRisks: [`Deployment constraints: ${JSON.stringify(src.deploymentConstraints)}`] }
      : {}),
    ...(next.length
      ? {
          recommendedFixes: next.slice(0, 5).map((t, i) => ({
            title: `Next step ${i + 1}`,
            description: t,
            priority: "Medium",
          })),
        }
      : {}),
  };
}

export function mapLocalReportToLite(detail: LocalReportDetails | null): MapResult {
  if (!detail) return { lite: null, issues: ["detail_missing"] };
  const report = asRecord(detail.report);
  if (!report) return { lite: null, issues: ["report_missing_or_invalid"] };

  const strategy = asRecord(report.strategy);
  const decisionSummary = asRecord(report.decisionSummary);
  const decisionLogic = asRecord(report.decisionLogic);
  const robustness = asRecord(report.robustnessScore);
  const walkForward = asRecord(report.walkForwardAnalysis);
  const wfaProfessional = asRecord(walkForward?.professional);
  const riskBlock = asRecord(report.riskAnalysis);
  const analysisSettings = asRecord(asRecord(report.parametersAndRunSettings)?.analysisSettings);
  const robustComponents = asRecord(robustness?.components);
  const robustModules = asRecord(robustness?.modules);

  const toNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const toStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
  const toBool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const issues: string[] = [];

  const lite: TestResultDataLite = {
    strategy: strategy
      ? {
          name: toStr(strategy.name),
          symbol: toStr(strategy.symbol),
          timeframe: toStr(strategy.timeframe),
          exchange: toStr(strategy.exchange),
        }
      : undefined,
    decisionSummary: decisionSummary
      ? {
          verdict: toStr(decisionSummary.verdict),
          confidence: toNum(decisionSummary.confidence),
          riskLevel: toStr(decisionSummary.riskLevel),
          deploymentReadiness: toBool(decisionSummary.deploymentReadiness),
        }
      : undefined,
    verdictPayload: asRecord(report.verdictPayload),
    robustnessScore: robustness
      ? {
          overall: toNum(robustness.overall),
          components: robustComponents
            ? {
                parameterStability: toNum(robustComponents.parameterStability),
                timeRobustness: toNum(robustComponents.timeRobustness),
                marketRegime: toNum(robustComponents.marketRegime),
                monteCarloStability: toNum(robustComponents.monteCarloStability),
                sensitivity: toNum(robustComponents.sensitivity),
              }
            : undefined,
          modules: robustModules ? (robustModules as Record<string, number>) : undefined,
        }
      : null,
    dataQualityGuardResult: asRecord(report.dataQualityGuardResult) ?? dataIntegrityCheckToGuard(asRecord(report.dataIntegrityCheck)),
    benchmarkComparison: asRecord(report.benchmarkComparison),
    proBenchmarkMetrics: asRecord(report.proBenchmarkMetrics),
    walkForwardAnalysis: walkForward,
    parameterSensitivity: asRecord(report.parameterSensitivity),
    turnoverAndCostDrag: asRecord(report.turnoverAndCostDrag),
    riskAnalysis: asRecord(report.riskAnalysis),
    strategyActionPlan:
      asRecord(report.strategyActionPlan) ??
      deploymentRecommendationToActionPlan(asRecord(report.deploymentRecommendation), {
        baseSharpe: toNum(riskBlock?.sharpeRatio ?? riskBlock?.sharpe),
        wfeAllWindows: toNum(walkForward?.wfe),
        wfaWindows: toNum(analysisSettings?.wfaWindows ?? walkForward?.windowsCount),
      }),
    monteCarloSimulation: asRecord(report.monteCarloSimulation),
    monteCarloValidation: asRecord(wfaProfessional?.monteCarloValidation),
    decisionLogic: decisionLogic
      ? {
          verdict: toStr(decisionLogic.verdict),
          rules: Array.isArray(decisionLogic.rules)
            ? decisionLogic.rules.map((r) => {
                const rr = asRecord(r);
                return {
                  name: toStr(rr?.name),
                  condition: toStr(rr?.condition),
                  passed: toBool(rr?.passed),
                };
              })
            : undefined,
          modifiers: Array.isArray(decisionLogic.modifiers)
            ? decisionLogic.modifiers.map((m) => {
                const mm = asRecord(m);
                return {
                  type: toStr(mm?.type),
                  description: toStr(mm?.description),
                  value: toStr(mm?.value),
                };
              })
            : undefined,
          auditNote: toStr(decisionLogic.auditNote),
        }
      : null,
  };

  if (!lite.verdictPayload && !lite.decisionSummary?.verdict) issues.push("missing_verdict_payload");
  if (!lite.robustnessScore?.overall && lite.robustnessScore?.overall !== 0) issues.push("missing_robustness_overall");

  return { lite: normalizeReportForBlockView(lite), issues };
}
