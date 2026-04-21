import type { TestResultDataLite } from "./types";
import { AnalysisBlockCardLite } from "./AnalysisBlockCardLite";
import { WfaBlockChartsLite } from "./WfaBlockChartsLite";

/** Unified missing-value token for metric cells (SaaS-style). */
const DISPLAY_NA = "n/a";

function fmtCell(s: string): string {
  if (s === "N/A" || s === "NaN%" || s.startsWith("NaN")) return DISPLAY_NA;
  return s;
}

/** Max DD may be stored as negative fraction (e.g. -0.429) or as positive percent. */
function formatDrawdownDisplay(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DISPLAY_NA;
  const a = Math.abs(v);
  const pct = a <= 1 ? a * 100 : a;
  return `${pct.toFixed(digits)}%`;
}

function asPercent(v: number | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return DISPLAY_NA;
  return `${(v * 100).toFixed(digits)}%`;
}

function asScore(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return DISPLAY_NA;
  return String(Math.round(v));
}

function asNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DISPLAY_NA;
  return v.toFixed(digits);
}

function verdictTone(verdict: string | undefined): string {
  const v = String(verdict || "").toUpperCase();
  if (v.includes("ROBUST") || v.includes("PASS")) return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  if (v.includes("CAUTION") || v.includes("WARN") || v.includes("UNCERTAIN")) return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  if (v.includes("FAIL") || v.includes("REJECT") || v.includes("NOT_RECOMMENDED") || v.includes("FRAGILE"))
    return "text-rose-300 border-rose-500/40 bg-rose-500/10";
  return "text-foreground border-border bg-muted/20";
}

function verdictCardTone(verdict: string | undefined): string {
  const v = String(verdict || "").toUpperCase();
  if (v.includes("FAIL") || v.includes("REJECT") || v.includes("NOT_RECOMMENDED") || v.includes("FRAGILE")) {
    return "border-rose-500/40 bg-rose-500/10";
  }
  if (v.includes("CAUTION") || v.includes("WARN") || v.includes("UNCERTAIN")) {
    return "border-amber-500/40 bg-amber-500/10";
  }
  if (v.includes("ROBUST") || v.includes("PASS")) {
    return "border-emerald-500/40 bg-emerald-500/10";
  }
  return "border-border bg-muted/20";
}

function sectionTone(kind: "good" | "warn" | "bad" | "neutral"): string {
  if (kind === "good") return "border-emerald-500/30 bg-emerald-500/10";
  if (kind === "warn") return "border-amber-500/30 bg-amber-500/10";
  if (kind === "bad") return "border-rose-500/30 bg-rose-500/10";
  return "border-border bg-muted/20";
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Use canonical performance degradation from Layer 2.5 when set; do not use raw `degradationRatio`
 * alone (it may be OOS retention, not the methodology line).
 */
function wfaPerfDegradationForDisplay(wfa: Record<string, unknown>): number | undefined {
  return num(wfa.performanceDegradation) ?? num(wfa.degradationForDisplay) ?? num(wfa.degradationRatio) ?? undefined;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function asciiBar(v: number | null, width = 12): string {
  if (v == null || !Number.isFinite(v)) return "░".repeat(width);
  const clamped = Math.max(0, Math.min(100, v));
  const filled = Math.round((clamped / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function scoreTone(v: number | null): "good" | "warn" | "bad" | "neutral" {
  if (v == null) return "neutral";
  if (v >= 70) return "good";
  if (v >= 40) return "warn";
  return "bad";
}

function MetricValue({
  value,
  derived = false,
}: {
  value: string;
  derived?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base font-semibold text-foreground">{value}</span>
      {derived ? (
        <span className="rounded border border-border/70 bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          derived
        </span>
      ) : null}
    </div>
  );
}

function DataQualityGuardBlock({ lite }: { lite: TestResultDataLite }) {
  const dqg = lite.dataQualityGuardResult || null;
  if (!dqg) return null;
  const verdict = typeof dqg.verdict === "string" ? dqg.verdict : DISPLAY_NA;
  const score = typeof dqg.finalScore === "number" ? dqg.finalScore : null;
  const diagnosis = typeof dqg.diagnosis === "string" ? dqg.diagnosis : null;
  const factor = typeof dqg.factor === "number" ? dqg.factor : null;
  const contribution = typeof dqg.contribution === "number" ? dqg.contribution : null;
  const robustNetEdge = typeof dqg.robustNetEdge === "string" ? dqg.robustNetEdge : "No net profit - outlier check n/a";
  const modules = Array.isArray(dqg.modules) ? (dqg.modules as unknown[]) : [];
  const verdictClass =
    /PASS|ROBUST/i.test(verdict) ? "text-emerald-400" : /FAIL|REJECT|BLOCK/i.test(verdict) ? "text-rose-400" : "text-amber-300";
  return (
    <AnalysisBlockCardLite
      title="DATA QUALITY GUARD"
      tooltip="Assesses reliability of sample and checks for data integrity blockers."
      copyPayload={dqg}
    >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-foreground">Data Quality Guard (DQG)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Score: {score != null ? `${Math.round(score)}%` : DISPLAY_NA}</span>
            <span className={"font-medium " + verdictClass}>{verdict}</span>
            <span className="text-muted-foreground">DQG Factor: {factor != null ? factor.toFixed(2) : DISPLAY_NA}</span>
            <span className="text-muted-foreground">Contribution: {contribution != null ? contribution.toFixed(1) : DISPLAY_NA}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Robust Net Edge (Safe Edge):</span> {robustNetEdge}
          </p>
          {diagnosis ? <p className="text-xs text-muted-foreground">{diagnosis}</p> : null}
          {modules.length > 0 ? (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-1 pr-2 text-left font-medium">Module</th>
                    <th className="py-1 pr-2 text-left font-medium">Score</th>
                    <th className="py-1 text-left font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.slice(0, 8).map((m, idx) => {
                    const row = asObj(m);
                    const moduleName = str(row?.module) || `module_${idx + 1}`;
                    const moduleScore = num(row?.score);
                    const moduleVerdict = str(row?.verdict) || DISPLAY_NA;
                    const verdictCls =
                      /PASS|ROBUST/i.test(moduleVerdict)
                        ? "text-emerald-400"
                        : /FAIL|REJECT|BLOCK/i.test(moduleVerdict)
                          ? "text-rose-400"
                          : "text-muted-foreground";
                    return (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="py-1 pr-2">{moduleName}</td>
                        <td className="py-1 pr-2">{moduleScore != null ? `${Math.round(moduleScore)}%` : "n/a"}</td>
                        <td className={"py-1 underline decoration-dotted " + verdictCls}>{moduleVerdict}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
    </AnalysisBlockCardLite>
  );
}

export function ReportBlocksView({ lite }: { lite: TestResultDataLite }) {
  const confidence = lite.decisionSummary?.confidence;
  const riskLevel = lite.decisionSummary?.riskLevel;
  const deploy = lite.decisionSummary?.deploymentReadiness;
  const robustness = lite.robustnessScore || null;
  const rules = Array.isArray(lite.decisionLogic?.rules) ? lite.decisionLogic?.rules : [];
  const modifiers = Array.isArray(lite.decisionLogic?.modifiers) ? lite.decisionLogic?.modifiers : [];
  const robustModules = robustness?.modules || null;
  const robustRows = [
    { key: "validation", label: "Walk-Forward & OOS", value: robustModules?.validation },
    { key: "risk", label: "Risk Profile", value: robustModules?.risk },
    { key: "stability", label: "Parameter Stability", value: robustModules?.stability },
    { key: "execution", label: "Execution Realism", value: robustModules?.execution },
  ];
  const dqgScore = num(asObj(lite.dataQualityGuardResult)?.finalScore);
  const blocked = robustRows.filter((r) => typeof r.value === "number" && r.value <= 0).map((r) => r.label);
  const overallN = typeof robustness?.overall === "number" ? Math.round(robustness.overall) : null;
  /** Same idea as decisionArtifacts scoreBlocked: 0 overall or any module at 0 is a hard gate. */
  const hardRobustnessBlock = (overallN != null && overallN === 0) || blocked.length > 0;
  let verdict =
    lite.decisionSummary?.verdict ||
    (typeof lite.verdictPayload?.verdict === "string" ? lite.verdictPayload.verdict : undefined);
  if (hardRobustnessBlock && typeof verdict === "string" && /^robust$/i.test(verdict.trim())) {
    const vp = lite.verdictPayload?.verdict;
    const logicV = lite.decisionLogic?.verdict;
    if (typeof vp === "string" && !/^robust$/i.test(vp.trim())) {
      verdict = vp;
    } else if (typeof logicV === "string" && !/^robust$/i.test(logicV.trim())) {
      verdict = logicV;
    } else {
      verdict = "FRAGILE";
    }
  }
  const overallBand = overallN == null ? DISPLAY_NA : overallN < 40 ? "FAIL" : overallN < 60 ? "CAUTION" : "PASS";
  const overallBandClass =
    overallBand === "PASS"
      ? "text-emerald-400"
      : overallBand === "CAUTION"
        ? "text-amber-300"
        : overallBand === "FAIL"
          ? "text-rose-400"
          : "text-foreground";
  const benchmark = asObj(lite.benchmarkComparison);
  const pro = asObj(lite.proBenchmarkMetrics);
  const wfa = asObj(lite.walkForwardAnalysis);
  const sens = asObj(lite.parameterSensitivity);
  const turnover = asObj(lite.turnoverAndCostDrag);
  const risk = asObj(lite.riskAnalysis);
  const actionPlan = asObj(lite.strategyActionPlan);
  const mcValidation = asObj(lite.monteCarloValidation);
  const mcSimulation = asObj(lite.monteCarloSimulation);
  const mc = mcValidation || mcSimulation;

  return (
    <div className="space-y-4 font-mono text-sm">
      <AnalysisBlockCardLite
        title="FINAL VERDICT"
        tooltip="Decision outcome and deployment gate summary."
        className={verdictCardTone(verdict)}
        copyPayload={{ decisionSummary: lite.decisionSummary, decisionLogic: lite.decisionLogic, verdictPayload: lite.verdictPayload }}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={"rounded-md border px-2 py-0.5 text-xs font-semibold " + verdictTone(verdict)}>
            {verdict || DISPLAY_NA}
          </span>
          <span className="text-xs text-muted-foreground">Confidence: {confidence != null ? asPercent(confidence) : DISPLAY_NA}</span>
          <span className="text-xs text-muted-foreground">Risk: {riskLevel || DISPLAY_NA}</span>
          <span className="text-xs text-muted-foreground">Deployment: {deploy == null ? DISPLAY_NA : deploy ? "Ready" : "Not ready"}</span>
        </div>
        {lite.verdictPayload && typeof lite.verdictPayload.bottomLine === "string" ? (
          <p className="text-sm italic text-muted-foreground">{lite.verdictPayload.bottomLine}</p>
        ) : null}
        {lite.verdictPayload && typeof lite.verdictPayload.caseDisplayName === "string" ? (
          <p className="text-sm text-muted-foreground">
            Diagnostic case: <span className="italic text-foreground/90">{lite.verdictPayload.caseDisplayName}</span> (Kiploks)
          </p>
        ) : null}
        {rules && rules.length > 0 ? (
          <div className="pt-2 border-t border-dashed border-border space-y-2">
            <p className="text-sm font-semibold text-foreground">Deployment Gate</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Validation gates</p>
            <ul className="space-y-1 text-sm">
              {rules.slice(0, 8).map((r, idx) => (
                <li key={idx} className={r.passed ? "text-emerald-400" : "text-rose-400"}>
                  {r.passed ? "✔" : "✗"} {r.name || r.condition || "rule"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {(confidence != null || (lite.verdictPayload && typeof lite.verdictPayload.successProbability === "number")) ? (
          <div className="pt-2 border-t border-dashed border-border space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Statistical confidence</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {confidence != null ? (
                <li>
                  - Bayesian pass probability: <span className="text-foreground">{asPercent(confidence)}</span>
                </li>
              ) : null}
              {lite.verdictPayload && typeof lite.verdictPayload.successProbability === "number" ? (
                <li>
                  - t-Stat & WFE composite:{" "}
                  <span className="text-foreground">{Math.round(lite.verdictPayload.successProbability)}%</span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {modifiers && modifiers.length > 0 ? (
          <div className="pt-2 border-t border-dashed border-border space-y-2">
            <p className="text-sm font-semibold text-foreground">Critical Notes</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {modifiers.slice(0, 5).map((m, idx) => (
                <li key={idx}>- {m.description || m.type || "modifier"}{m.value ? ` (${m.value})` : ""}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </AnalysisBlockCardLite>

      <AnalysisBlockCardLite
        title="ROBUSTNESS SCORE"
        tooltip="Composite score based on validation, risk, stability, and execution modules."
        className={
          overallBand === "PASS"
            ? sectionTone("good")
            : overallBand === "CAUTION"
              ? sectionTone("warn")
              : overallBand === "FAIL"
                ? sectionTone("bad")
                : sectionTone("neutral")
        }
        copyPayload={robustness}
      >
        <div className="text-center py-1">
          <p className={"text-2xl font-bold " + overallBandClass}>
            {overallN == null ? DISPLAY_NA : `${overallN} / 100 (${overallBand})`}
          </p>
          {blocked.length ? (
            <p className="mt-2 text-sm font-medium text-rose-400">
              Blocked by {blocked.join(", ")} modules
            </p>
          ) : null}
        </div>
        {blocked.length ? (
          <div className="mx-auto mt-1 max-w-2xl rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
            <p className="mb-1 font-medium">Diagnosis</p>
            <p>
              {blocked.join(", ")} modules are below the deployment threshold. Improve these modules to unlock the score.
            </p>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">No hard blockers detected in module breakdown.</p>
        )}
        <div className="pt-2 border-t border-dashed border-border space-y-2">
          <p className="text-xs font-semibold text-foreground">Breakdown (contributing factors)</p>
          {dqgScore != null ? (
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-foreground">Data Quality Guard</p>
              <div className="flex items-center gap-2">
                <span
                  className={
                    "w-32 flex-shrink-0 font-mono text-xs " +
                    (dqgScore >= 60 ? "text-emerald-400" : dqgScore >= 40 ? "text-amber-300" : "text-rose-400")
                  }
                >
                  {asciiBar(Math.round(dqgScore))}
                </span>
                <span className="min-w-[2ch] flex-shrink-0 font-semibold text-foreground">{Math.round(dqgScore)}</span>
              </div>
              <p className="leading-tight text-muted-foreground">
                {dqgScore >= 60
                  ? "→ Adequate sample quality for full deployment gate review"
                  : dqgScore >= 40
                    ? "→ Mixed; open the DQG block for module detail"
                    : "→ Below typical bar; confirm period, trades, and integrity before trusting downstream metrics"}
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            {robustRows.map((r) => {
              const v = typeof r.value === "number" ? Math.round(r.value) : null;
              const isBlocked = v != null && v <= 0;
              const tone = scoreTone(v);
              const weight =
                r.key === "validation" ? 40 : r.key === "risk" ? 30 : r.key === "stability" ? 20 : r.key === "execution" ? 10 : 0;
              const barClass =
                tone === "good"
                  ? "text-emerald-400"
                  : tone === "warn"
                    ? "text-amber-300"
                    : "text-rose-400";
              return (
                <div
                  key={r.key}
                  className={
                    "space-y-0.5 text-xs rounded-sm border px-2 py-2 " +
                    (isBlocked ? "border-rose-500/30 bg-rose-500/10" : "border-border/80 bg-muted/20")
                  }
                >
                  <p className="font-medium text-foreground">
                    {r.label} <span className="text-muted-foreground">({weight}%)</span>
                    {isBlocked ? <span className="font-semibold text-rose-400"> (blocking)</span> : null}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={"w-32 flex-shrink-0 font-mono text-xs " + barClass}>{asciiBar(v)}</span>
                    <span className="min-w-[2ch] flex-shrink-0 font-semibold text-foreground">{v == null ? DISPLAY_NA : v}</span>
                  </div>
                  <p className={"leading-tight " + (isBlocked ? "font-medium text-rose-400" : "text-muted-foreground")}>
                    {isBlocked
                      ? "→ BLOCKED"
                      : r.key === "stability"
                        ? "→ Parameters stable across sensitivity tests"
                        : "→ Within threshold"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </AnalysisBlockCardLite>

      <DataQualityGuardBlock lite={lite} />

      {(benchmark || pro) ? (
          <AnalysisBlockCardLite
            title="BENCHMARK METRICS"
            tooltip="Relative performance versus baseline and pro benchmark diagnostics."
            className={
              num(benchmark?.excessReturn) != null
                ? (num(benchmark?.excessReturn) as number) > 0
                  ? sectionTone("good")
                  : sectionTone("warn")
                : sectionTone("neutral")
            }
            copyPayload={{ benchmarkComparison: benchmark, proBenchmarkMetrics: pro }}
          >
            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold">Quick Win (WFA summary)</p>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground">[A] OOS equity-based</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span>OOS Sharpe: {asNum(num(pro?.avgOosSharpe), 2)}</span>
                    <span>OOS Calmar: {asNum(num(pro?.avgOosCalmar), 2)}</span>
                    <span>OOS Max DD: {asPercent(num(pro?.oosMaxDrawdown) ?? undefined)}</span>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">[B] WFA period-level</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span>Relative Loss Magnitude: {asPercent(num(pro?.oosRetention) ?? undefined)}</span>
                    <span>WFE: {asPercent(num(pro?.wfe) ?? undefined)}</span>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">[C] Full backtest context</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span>Full Sharpe: {asNum(num(benchmark?.fullSharpe), 2)}</span>
                    <span>Full Calmar: {asNum(num(benchmark?.fullCalmar), 2)}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-dashed border-border pt-1 text-xs">
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Profitable Windows</span>
                  <span className="shrink-0 text-right font-semibold">{str(pro?.profitableWindowsText) || DISPLAY_NA}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">OOS/IS Trend Match</span>
                  <span className="shrink-0 text-right font-semibold">{str(pro?.trendMatch) || DISPLAY_NA}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Win Rate Change (OOS - IS, pp)</span>
                  <span className="shrink-0 text-right font-semibold">{asNum(num(pro?.winRateChangePp), 1)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold">Statistical Robustness (OOS Validation)</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">WFE (Median OOS/IS)</span>
                  <span className="shrink-0 text-right font-semibold">{asPercent(num(pro?.wfeMedian) ?? undefined)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">WFE Variance</span>
                  <span className="shrink-0 text-right font-semibold">{asNum(num(pro?.wfeVariance), 2)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Parameter Stability Index (PSI)</span>
                  <span className="shrink-0 text-right font-semibold">{asNum(num(pro?.psi), 1)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Edge Half-Life (T1/2, OOS)</span>
                  <span className="shrink-0 text-right font-semibold">{str(pro?.edgeHalfLife) || DISPLAY_NA}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">WFA Windows</span>
                  <span className="shrink-0 text-right font-semibold">{num(pro?.wfaWindows) ?? DISPLAY_NA}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Avg OOS Sharpe (window-level)</span>
                  <span className="shrink-0 text-right font-semibold">{asNum(num(pro?.avgOosSharpe), 2)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="min-w-0 flex-1 text-muted-foreground">Relative Change (OOS-IS)/|IS|</span>
                  <span className="shrink-0 text-right font-semibold">{asPercent(num(pro?.relativeChange) ?? undefined)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span>Verdict</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{/REJECT|FAIL/i.test(str(pro?.verdict) || "") ? "🔴" : "🟡"}</span>
                <span className={/REJECT|FAIL/i.test(str(pro?.verdict) || "") ? "font-semibold text-rose-400" : "font-semibold text-amber-300"}>
                  {str(pro?.verdict) || DISPLAY_NA}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{str(pro?.verdictReason) || "No detailed verdict explanation in payload."}</p>
            </div>

            <div className="rounded-md border border-dashed border-border border-l-rose-500 bg-rose-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span>Capital Kill Switch - The Red Line</span>
              </div>
              <p className="mt-1 font-semibold text-amber-300">{str(pro?.killSwitchValue) || DISPLAY_NA}</p>
              <p className="mt-1 text-xs text-muted-foreground">{str(pro?.killSwitchHint) || "If the next OOS window is negative, disable bot."}</p>
            </div>

            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold">Summary (possible)</p>
              {Array.isArray(benchmark?.interpretation) ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {(benchmark?.interpretation as unknown[]).slice(0, 4).map((it, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span>•</span>
                      <span>{str(it) || "summary line"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No summary bullets available in payload.</p>
              )}
            </div>
          </AnalysisBlockCardLite>
      ) : null}

      {wfa ? (
          <AnalysisBlockCardLite
            title="WALK-FORWARD VALIDATION"
            tooltip="WFE, consistency, degradation, failed windows, and professional WFA details."
            className={
              num(wfa.wfe) != null
                ? (num(wfa.wfe) as number) >= 0.7
                  ? sectionTone("good")
                  : (num(wfa.wfe) as number) >= 0.5
                    ? sectionTone("warn")
                    : sectionTone("bad")
                : sectionTone("neutral")
            }
            copyPayload={wfa}
          >
            <p className="text-xs text-muted-foreground">Time Stability & Overfitting Control</p>
            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold">Performance Transfer</p>
                <p className="text-xs text-muted-foreground">In-Sample (IS) vs Out-of-Sample (OOS)</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total OOS Return</p>
                  <p className="mt-0.5 font-semibold text-rose-400">{asPercent(num(wfa.totalOosReturn) ?? undefined)}</p>
                </div>
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OOS Win Rate</p>
                  <p className="mt-0.5 font-semibold text-muted-foreground">{str(wfa.oosWinRateText) || DISPLAY_NA}</p>
                </div>
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IS Avg Return</p>
                  <p className="mt-0.5 font-semibold text-muted-foreground">{asPercent(num(wfa.isAvgReturn) ?? undefined)}</p>
                </div>
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OOS Avg Return</p>
                  <p className="mt-0.5 font-semibold text-rose-400">{asPercent(num(wfa.oosAvgReturn) ?? undefined)}</p>
                </div>
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overfitting Score</p>
                  <p className="mt-0.5 font-semibold text-amber-300">{str(wfa.overfittingScore) || DISPLAY_NA}</p>
                </div>
              </div>
              <WfaBlockChartsLite wfa={wfa as unknown as Record<string, unknown>} />
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-4">
                <span>WFE (Efficiency):</span>
                <span className="font-semibold text-rose-400">{asNum(num(wfa.wfe), 2)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span>Consistency:</span>
                <span className="font-semibold">{str(wfa.consistencyText) || asPercent(num(wfa.consistency) ?? undefined)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span>Performance Degradation:</span>
                <span className="font-semibold text-rose-400">
                  {asPercent(wfaPerfDegradationForDisplay(wfa as unknown as Record<string, unknown>))}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>Failed Windows:</span>
                <span className="font-semibold text-rose-400">
                  {str(asObj(wfa.failedWindows)?.text) ||
                    (num(asObj(wfa.failedWindows)?.count) != null
                      ? `${num(asObj(wfa.failedWindows)?.count)}${num(wfa.windowsCount) != null ? ` / ${num(wfa.windowsCount)}` : ""}`
                      : DISPLAY_NA)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Consistency uses only windows with IS &gt; 0. Failed Windows = windows with OOS &lt;= 0 or insufficient OOS trades.
              </p>
            </div>
            <div className="rounded-sm border border-dashed border-border bg-muted/20 p-3 space-y-2 text-xs">
              <p className="font-semibold">Professional WFA</p>
              {str(asObj(wfa.professional)?.staleBanner) ? (
                <div className="rounded-sm border border-dashed border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                  {str(asObj(wfa.professional)?.staleBanner)}
                </div>
              ) : null}
              <div className="border-b border-dashed border-border pb-2">
                <span className="text-muted-foreground">Grade:</span>{" "}
                <span className="font-semibold">{str(asObj(wfa.professional)?.grade) || DISPLAY_NA}</span>
                {str(asObj(wfa.professional)?.gradeOverride) ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{str(asObj(wfa.professional)?.gradeOverride)}</p>
                ) : null}
              </div>
              <p className="text-muted-foreground">{str(asObj(wfa.professional)?.recommendation) || "Recommendation unavailable."}</p>
              <div className="space-y-1">
                <p><span className="font-medium text-muted-foreground">WFE Advanced:</span> {str(asObj(wfa.professional)?.wfeAdvanced) || DISPLAY_NA}</p>
                <p><span className="font-medium text-muted-foreground">Regime:</span> {str(asObj(wfa.professional)?.regime) || DISPLAY_NA}</p>
                <p><span className="font-medium text-muted-foreground">Monte Carlo:</span> {str(asObj(wfa.professional)?.monteCarlo) || DISPLAY_NA}</p>
                <p><span className="font-medium text-muted-foreground">Stress:</span> {str(asObj(wfa.professional)?.stress) || DISPLAY_NA}</p>
                <p><span className="font-medium text-muted-foreground">Equity curve:</span> {str(asObj(wfa.professional)?.equityCurve) || DISPLAY_NA}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-dashed border-border pt-2">
              <p className="text-xs font-semibold">Failed Windows Details</p>
              {asObj(wfa.failedWindows) && Array.isArray(asObj(wfa.failedWindows)?.windows) ? (
                (asObj(wfa.failedWindows)?.windows as unknown[]).slice(0, 6).map((it, idx) => {
                  const row = asObj(it);
                  return (
                    <p key={idx} className="text-xs text-rose-400">
                      • {str(row?.period) || str(row?.window) || `Period ${idx + 1}`}: {str(row?.reason) || "Validation return is non-positive"}
                    </p>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground">No failed-window details in payload.</p>
              )}
            </div>
            <div className="border-t border-dashed border-border pt-2 text-xs">
              <p className="font-semibold text-rose-400">▶ Verdict: {str(wfa.verdict) || DISPLAY_NA}</p>
              <p className="mt-1 text-muted-foreground">{str(wfa.verdictExplanation) || "No verdict explanation provided."}</p>
            </div>
          </AnalysisBlockCardLite>
      ) : null}

      {mc ? (
        <AnalysisBlockCardLite
          title="MONTE CARLO"
          tooltip="Monte Carlo stability and distribution diagnostics. Uses professional monteCarloValidation when available, otherwise monteCarloSimulation."
          className={
            str(mc.pathStability) === "HIGH" || str(mc.level) === "LOW"
              ? sectionTone("good")
              : str(mc.pathStability) === "LOW" || str(mc.level) === "HIGH"
                ? sectionTone("bad")
                : sectionTone("neutral")
          }
          copyPayload={mc}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Simulations</p>
              <p className="mt-1 text-base font-semibold text-foreground">{num(mc.simulations) ?? DISPLAY_NA}</p>
            </div>
            <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Path stability</p>
              <p className="mt-1 text-base font-semibold text-foreground">{str(mc.pathStability) || DISPLAY_NA}</p>
            </div>
            <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tail risk</p>
              <p className="mt-1 text-base font-semibold text-foreground">{str(mc.tailRisk) || DISPLAY_NA}</p>
            </div>
            <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">MC stability (Robustness)</p>
              <p className="mt-1 text-base font-semibold text-foreground">{asPercent(lite.robustnessScore?.components?.monteCarloStability)}</p>
            </div>
          </div>
          {asObj(mc.cagrDistribution) || asObj(mc.drawdownDistribution) ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">CAGR distribution</p>
                <p className="mt-1 text-sm text-foreground">
                  worst5: {num(asObj(mc.cagrDistribution)?.worst5Percent) ?? DISPLAY_NA} | median: {num(asObj(mc.cagrDistribution)?.median) ?? DISPLAY_NA} | best95: {num(asObj(mc.cagrDistribution)?.best95Percent) ?? DISPLAY_NA}
                </p>
              </div>
              <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Drawdown distribution</p>
                <p className="mt-1 text-sm text-foreground">
                  worst5: {num(asObj(mc.drawdownDistribution)?.worst5Percent) ?? DISPLAY_NA} | median: {num(asObj(mc.drawdownDistribution)?.median) ?? DISPLAY_NA} | best95: {num(asObj(mc.drawdownDistribution)?.best95Percent) ?? DISPLAY_NA}
                </p>
              </div>
            </div>
          ) : null}
          {Array.isArray(mc.interpretation) ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {(mc.interpretation as unknown[]).slice(0, 4).map((line, idx) => (
                <li key={idx}>- {str(line) || "note"}</li>
              ))}
            </ul>
          ) : null}
        </AnalysisBlockCardLite>
      ) : null}

      {sens ? (
          <AnalysisBlockCardLite
            title="PARAMETER SENSITIVITY & STABILITY"
            tooltip="Sensitivity (R²), stability bands, governance advisory, and deployment audit verdict."
            className={
              num(sens.riskScore) != null
                ? (num(sens.riskScore) as number) >= 65
                  ? sectionTone("good")
                  : (num(sens.riskScore) as number) >= 50
                    ? sectionTone("warn")
                    : sectionTone("bad")
                : sectionTone("neutral")
            }
            copyPayload={sens}
          >
            <p className="text-xs text-muted-foreground">
              Methodology: Sensitivity = R² between parameter value and trial score. Risk Score uses rounded sensitivities and penalty bands.
            </p>
            <p className="text-xs text-muted-foreground">Suggested Mitigation: {str(sens.suggestedMitigation) || "Risk Neutral"}</p>

            <div className="space-y-2 border-t border-dashed border-border pt-2 text-xs">
              <div className="grid grid-cols-[minmax(120px,1fr)_70px_64px_80px_100px] gap-3 text-muted-foreground">
                <div>Parameter</div>
                <div className="text-right">Optimal</div>
                <div className="text-right">Topology</div>
                <div className="text-right">Sensitivity</div>
                <div className="text-right">Status</div>
              </div>
              <div className="space-y-1">
                {Array.isArray(sens.parameters) ? (
                  (sens.parameters as unknown[]).slice(0, 10).map((p, idx) => {
                    const row = asObj(p);
                    const sensitivity = num(row?.sensitivity);
                    const status = str(row?.status) || (sensitivity != null && sensitivity >= 0.6 ? "Fragile" : "Stable");
                    const statusCls =
                      /FRAGILE|HIGH/i.test(status) ? "text-rose-400" : /TUNING|MODERATE/i.test(status) ? "text-amber-300" : "text-emerald-400";
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-[minmax(120px,1fr)_70px_64px_80px_100px] items-center gap-3">
                          <div className="truncate">{str(row?.name) || `param_${idx + 1}`}</div>
                          <div className="text-right">{str(row?.optimal) || num(row?.optimal) || "n/a"}</div>
                          <div className="text-right text-muted-foreground">~</div>
                          <div className="text-right">{asNum(sensitivity, 2)}</div>
                          <div className={"text-right font-semibold " + statusCls}>🟢 {status}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">Suggested Mitigation: {str(row?.mitigation) || "Risk Neutral"}</div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground">No parameter rows in payload.</p>
                )}
              </div>
            </div>

            <div className="space-y-1 border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Scale (classification bands): </span>
                Stable [0, 0.30); Reliable [0.30, 0.40); Needs Tuning [0.40, 0.60); Fragile &gt;= 0.60.
              </p>
              <p>Sensitivity (R²): strength of parameter-score relationship, not magnitude of effect.</p>
              <p>Topology (when available): flat = stable, sharp peak = fragile.</p>
            </div>

            <div className="space-y-2 border-t border-dashed border-border pt-2 text-xs">
              <p className="font-semibold">DIAGNOSTIC SUMMARY</p>
              <div className="space-y-1 text-muted-foreground">
                <p>1. Local Topology & Stability</p>
                <p>2. Governance Impact (Suggested Mitigation)</p>
                <p>Signal Attenuation: <span className="font-semibold text-rose-400">{asPercent(num(sens.signalAttenuation) ?? undefined)}</span></p>
                <p>Sharpe Retention (IS -&gt; OOS): <span className="font-semibold text-emerald-400">{asPercent(num(sens.sharpeRetention) ?? undefined)}</span></p>
                <p>Sharpe Drift (OOS vs IS): <span className="font-semibold text-emerald-400">{asNum(num(sens.sharpeDrift), 1)} p.p.</span></p>
                <p>Max Tail-Risk Reduction: <span className="font-semibold text-amber-300">{asPercent(num(sens.maxTailRiskReduction) ?? undefined)}</span></p>
                <p>3. Multi-Parameter Coupling</p>
                <p className="font-medium">{str(sens.couplingSummary) || "No dominant unstable interactions detected."}</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-dashed border-border pt-2 text-xs">
              <p className="font-semibold">AUDIT VERDICT</p>
              <p className="text-muted-foreground">
                Deployment Status:{" "}
                <span className="font-semibold text-emerald-400">{str(sens.deploymentStatus) || "APPROVED (no Decay check)"}</span>
              </p>
              <p className="text-amber-300">Performance Decay: {str(sens.performanceDecayNote) || "n/a (min 3 periods required for decay check)."}</p>
              <p className="text-muted-foreground">
                Risk Score:{" "}
                <span className="text-muted-foreground/90">
                  {str(sens.riskScoreFormula) || `Base ${num(sens.baseScore) ?? DISPLAY_NA} - Penalty ${num(sens.penalty) ?? DISPLAY_NA} ->`}
                </span>{" "}
                <span className="font-semibold text-emerald-400">
                  {str(sens.riskClass) || "LOW"} ({num(sens.riskScore) ?? DISPLAY_NA}/100)
                </span>
              </p>
              <p className="text-muted-foreground">Pro-Note: {str(sens.proNote) || "Highest sensitivity parameter shown in table."}</p>
            </div>
          </AnalysisBlockCardLite>
      ) : null}

      {turnover ? (
          <AnalysisBlockCardLite
            title="TRADING INTENSITY & COST DRAG"
            tooltip="Turnover, execution costs, capacity limits, and deployment status."
            className={
              str(turnover.executionGrade)
                ? /A|B/.test(String(str(turnover.executionGrade)))
                  ? sectionTone("good")
                  : /C/.test(String(str(turnover.executionGrade)))
                    ? sectionTone("warn")
                    : sectionTone("bad")
                : sectionTone("neutral")
            }
            copyPayload={turnover}
          >
            {(() => {
              const turnoverValue = num(turnover.turnover);
              const annualTurnover = num(turnover.annualTurnover) ?? turnoverValue;
              const costDragBpsValue = num(turnover.costDragBps);
              const costDragFallbackRaw = num(turnover.costDrag);
              const costDragFallback = costDragFallbackRaw != null ? costDragFallbackRaw * 100 : null;
              const netEdgeValue = num(turnover.netEdgeBps);
              const netEdgeFallback = num(turnover.avgNetProfitPerTradeBps);
              const avgTradesMonth = num(turnover.avgTradesPerMonth);
              const avgHoldingHours = num(turnover.avgHoldingHours);
              const utilization = num(turnover.avgPositionSizePct);
              return (
                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground">Execution: {str(turnover.executionMode) || "Simple (estimated fees)"}</p>
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
                    Results use estimated fees/slippage. Provide exact exchange parameters for institutional-grade analysis.
                  </div>
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
                    Position velocity can exceed institutional turnover when positions overlap; institutional turnover is used for cost and rebate.
                  </div>
                  <div className="rounded border border-dashed border-border bg-muted/20 p-3">
                    <p className="mb-1 text-[11px] font-semibold">INTERPRETIVE SUMMARY</p>
                    <p className="text-muted-foreground">
                      Period gross may be negative even when per-trade gross is positive; accumulated costs can dominate at calendar level.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Baseline AUM:</span>
                        <span className="font-semibold text-rose-400">{str(turnover.baselineAum) || "$1,000"}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Avg Trades / Month:</span>
                        <span className="font-semibold">{avgTradesMonth ?? DISPLAY_NA}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Annual Turnover (institutional):</span>
                        <span className="font-semibold">{asNum(annualTurnover, 1)}x</span>
                      </div>
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Position velocity (holding-period):</span>
                        <span className="font-semibold text-muted-foreground">{asNum(num(turnover.positionVelocity), 1)}x</span>
                      </div>
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Avg Holding Time:</span>
                        <span className="font-semibold">{avgHoldingHours != null ? `${asNum(avgHoldingHours, 1)}h` : DISPLAY_NA}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(140px,1fr)_auto] items-center gap-3">
                        <span>Avg position size:</span>
                        <span className="font-semibold">{utilization != null ? `${asNum(utilization, 1)}% of AUM` : DISPLAY_NA}</span>
                      </div>
                    </div>
                  </div>

                  <p className="border-t border-dashed border-border pt-2 font-semibold">EFFICIENCY & COST LIMITS</p>
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Profit Factor (Gross):</span>
                      <span className="font-semibold text-rose-400">{asNum(num(turnover.profitFactorGross), 2)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Profit Factor (Net):</span>
                      <span className="font-semibold text-rose-400">{asNum(num(turnover.profitFactorNet), 2)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Cost / Edge Ratio:</span>
                      <span className="font-semibold text-rose-400">{str(turnover.costEdgeRatioText) || "n/a (negative gross edge)"}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Avg Net Profit / Trade (bps):</span>
                      <span className="font-semibold text-rose-400">{asNum(netEdgeValue ?? netEdgeFallback, 2)} bps</span>
                    </div>
                  </div>

                  <p className="border-t border-dashed border-border pt-2 font-semibold">COST DECOMPOSITION (CAGR)</p>
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Exchange Fees:</span>
                      <span className="font-semibold text-emerald-400">{asPercent(num(turnover.exchangeFeesCagr) ?? undefined)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Slippage:</span>
                      <span className="font-semibold text-emerald-400">{asPercent(num(turnover.slippageCagr) ?? undefined)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Market Impact (est.):</span>
                      <span className="font-semibold text-muted-foreground">{str(turnover.marketImpactText) || "n/a - participation ratio too high for model"}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-3">
                      <span>Total Cost Drag:</span>
                      <span className="font-semibold text-emerald-400">
                        {costDragBpsValue != null || costDragFallback != null
                          ? `${asNum(costDragBpsValue ?? costDragFallback, 2)} bps`
                          : DISPLAY_NA}
                      </span>
                    </div>
                  </div>

                  <p className="border-t border-dashed border-border pt-2 font-semibold">STATUS</p>
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[minmax(170px,1fr)_auto] items-center gap-3">
                      <span>Deployment Class:</span>
                      <span className="font-semibold text-rose-400">{str(turnover.deploymentClass) || "Micro-cap / Research-only"}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(170px,1fr)_auto] items-center gap-3">
                      <span>COST ADAPTABILITY:</span>
                      <span className="font-semibold text-rose-400">{str(turnover.costAdaptability) || "FAIL"}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(170px,1fr)_auto] items-center gap-3">
                      <span>Required Alpha Boost (bps/trade):</span>
                      <span className="font-semibold text-rose-400">{asNum(num(turnover.requiredAlphaBoostBps), 2)} bps</span>
                    </div>
                    <div className="grid grid-cols-[minmax(170px,1fr)_auto] items-center gap-3">
                      <span>EXECUTION RISK:</span>
                      <span className="font-semibold text-amber-300">{str(asObj(turnover.status)?.executionRisk) || "WARNING"}</span>
                    </div>
                    <div className="text-muted-foreground">Z-Score: {asNum(num(turnover.zScore), 2)} (indicative only).</div>
                  </div>
                </div>
              );
            })()}
          </AnalysisBlockCardLite>
      ) : null}

      {risk ? (
          <AnalysisBlockCardLite
            title="RISK METRICS (OUT-OF-SAMPLE)"
            tooltip="OOS risk profile from stitched OOS equity/returns with tail and stability diagnostics."
            className={
              num(risk.maxDrawdown) != null
                ? Math.abs(num(risk.maxDrawdown) as number) <= 0.15
                  ? sectionTone("good")
                  : Math.abs(num(risk.maxDrawdown) as number) <= 0.25
                    ? sectionTone("warn")
                    : sectionTone("bad")
                : sectionTone("neutral")
            }
            copyPayload={risk}
          >
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">Out-of-sample risk metrics from Walk-Forward Analysis (stitched OOS equity curve or window returns).</p>
              {str(asObj(risk)?.diagnosticNote) ? (
                <p className="text-[11px] text-amber-300/90 border border-dashed border-amber-500/30 rounded-sm px-2 py-1">
                  {str(asObj(risk)?.diagnosticNote)}
                </p>
              ) : null}
              <div className="space-y-0">
                {(
                  [
                    ["Max Drawdown", formatDrawdownDisplay(num(risk.maxDrawdown)), "Recovery Factor", asNum(num(risk.recoveryFactor), 2)],
                    ["Sharpe Ratio (OOS)", asNum(num(risk.sharpeRatio) ?? num(risk.sharpe), 2), "Sortino Ratio", asNum(num(risk.sortinoRatio), 2)],
                    ["VaR (95%)", asPercent(num(risk.var95) ?? undefined), "CVaR (ES)", asPercent(num(risk.cvar95) ?? num(risk.expectedShortfall95) ?? undefined)],
                    ["Profit Factor (OOS)", asNum(num(risk.profitFactor), 2), "Gain-to-Pain", asNum(num(risk.gainToPain), 2)],
                    ["Trade Win Rate", asPercent(num(risk.tradeWinRate) ?? undefined), "Expectancy (loss units)", asNum(num(risk.expectancyLossUnits), 2)],
                    ["Period Win Rate (trades)", asPercent(num(risk.periodWinRate) ?? undefined), "Tail Ratio", asNum(num(risk.tailRatio), 2)],
                    ["Payoff Ratio", asNum(num(risk.payoffRatio), 2), "Edge Stability (t)", asNum(num(risk.edgeStabilityT), 2)],
                    ["Skewness", asNum(num(risk.skewness), 2), "Kurtosis", asNum(num(risk.kurtosis), 2)],
                  ] as const
                ).map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                    <div className="flex min-w-0 items-center justify-between gap-4">
                      <span>{row[0]}</span>
                      <span className="shrink-0 font-semibold text-foreground">{fmtCell(row[1])}</span>
                    </div>
                    <span className="text-muted-foreground">|</span>
                    <div className="flex min-w-0 items-center justify-between gap-4">
                      <span>{row[2]}</span>
                      <span className="shrink-0 font-semibold">{fmtCell(row[3])}</span>
                    </div>
                  </div>
                ))}
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span>Durbin-Watson</span>
                  <span className="shrink-0 font-semibold">{fmtCell(asNum(num(risk.durbinWatson), 2))}</span>
                </div>
              </div>
              <div className="space-y-1 border-t border-dashed border-border pt-2">
                <p className="text-xs text-amber-300">
                  <span className="font-semibold text-foreground">Diagnostic:</span> Payoff Ratio can be low; negative Recovery Factor means strategy remains net negative.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Context:</span> OOS metrics may come from a small sample; interpret with caution.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Regime Context:</span> High drawdown may indicate regime-dependent risk.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Tail Risk Profile:</span> Fat tails and degenerate VaR/CVaR estimates reduce reliability.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Tail Authority:</span> When ES sample is insufficient, treat VaR as lower-bound only.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Risk Attribution:</span> Edge profile may be mixed with limited payoff buffer.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Risk Verdict:</span>{" "}
                  {str(risk.verdict) || "Insufficient data - collect more walk-forward windows before interpreting."}
                </p>
                <div className="border-t border-dashed border-border pt-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-semibold uppercase text-rose-300">❌ UNSTABLE</span>
                    <span className="text-muted-foreground">Insufficient data or unstable OOS distribution.</span>
                    <span className="font-semibold text-foreground">Max Leverage: 1x</span>
                  </div>
                </div>
              </div>
            </div>
          </AnalysisBlockCardLite>
      ) : null}

      {(actionPlan || verdict) ? (
          <AnalysisBlockCardLite
            title="STRATEGY ACTION PLAN"
            tooltip="Institutional decision engine with phase gates, slippage sensitivity, and recovery conditions."
            className={
              verdict && /ROBUST|PASS/i.test(verdict)
                ? sectionTone("good")
                : verdict
                  ? sectionTone("warn")
                  : sectionTone("neutral")
            }
            copyPayload={{ strategyActionPlan: actionPlan, verdict }}
          >
            <div className="space-y-3 text-xs">
              <div>
                <p className="mb-2 font-semibold text-foreground">Slippage Sensitivity Analysis</p>
                {num(actionPlan?.baseSharpe) != null && (num(actionPlan?.baseSharpe) as number) < 0 ? (
                  <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 p-3">
                    <span className="font-semibold text-rose-400">
                      Strategy not viable - slippage sensitivity table suppressed (negative base Sharpe).
                    </span>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">Baseline Sharpe: {str(actionPlan?.baselineSharpeSource) || "from WFA OOS (window-level)."}</p>
                <p className="mt-1 text-xs text-muted-foreground">WFE {asNum(num(actionPlan?.wfeAllWindows), 2)} (all windows, n={num(actionPlan?.wfaWindows) ?? DISPLAY_NA})</p>
                <p className="mt-1 text-xs text-muted-foreground">Equity erodes as slippage increases.</p>
              </div>

              <div>
                <p className="mb-2 font-semibold text-foreground">The Decision Engine</p>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 font-medium text-rose-400">
                      Phase 1: {str(actionPlan?.phase1Status) || ((num(actionPlan?.baseSharpe) ?? -1) < 0 ? "NOT VIABLE" : "INCUBATION")}
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      <li>
                        <strong className="text-foreground">Allocation:</strong>{" "}
                        {str(actionPlan?.allocationPlan) ||
                          (((num(actionPlan?.baseSharpe) ?? -1) < 0 ? "0% - strategy not viable. Do not allocate." : "10-20% with strict guardrails."))}
                      </li>
                      <li>
                        <strong className="text-foreground">Monitoring:</strong>{" "}
                        {str(actionPlan?.monitoringPlan) || "Track sensitive parameters and OOS Sharpe trajectory."}
                      </li>
                      <li>
                        <strong className="text-foreground">Runtime Kill Switch:</strong> {str(actionPlan?.killSwitchStatus) || "TRIGGERED"}
                      </li>
                    </ul>
                    <div className="mt-2 pl-5 text-[11px] text-muted-foreground">
                      <p className="mb-1 font-medium text-foreground">Kill Switch Reset Conditions (ALL must be met):</p>
                      <ul className="list-none space-y-0.5">
                        <li>OOS Sharpe &gt; 0 across minimum 2 consecutive windows</li>
                        <li>Fail ratio drops below 33%</li>
                        <li>WFE (all windows) above Phase 2 threshold</li>
                        <li>Manual review by risk manager</li>
                      </ul>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-foreground">Phase 2: {str(actionPlan?.phase2Status) || "UNAVAILABLE"}</p>
                    <p className="text-xs text-muted-foreground">
                      {str(actionPlan?.phase2Note) ||
                        "Phase 2 requires Phase 1 pass, consecutive WFE confirmation, and regime validation."}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 font-semibold text-foreground">Why This Works</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="mb-2 font-medium text-emerald-400">Bull Case</p>
                    <p className="text-xs italic text-muted-foreground">
                      {str(actionPlan?.bullCase) || "n/a - strategy not valid (negative base Sharpe)."}
                    </p>
                  </div>
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="mb-2 font-medium text-rose-400">Bear Case (Risks)</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {Array.isArray(actionPlan?.bearCaseRisks) ? (
                        (actionPlan?.bearCaseRisks as unknown[]).slice(0, 3).map((r, idx) => (
                          <li key={idx}>{str(r) || "risk"}</li>
                        ))
                      ) : (
                        <li>Regime robustness is insufficient; strategy not validated across market conditions.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-foreground">Recommended Fixes</p>
                <ul className="list-none space-y-1.5 text-xs text-muted-foreground">
                  {Array.isArray(actionPlan?.recommendedFixes) ? (
                    (actionPlan?.recommendedFixes as unknown[]).slice(0, 4).map((f, idx) => {
                      const row = asObj(f);
                      return (
                        <li key={idx} className="flex flex-wrap items-baseline gap-x-1">
                          <span className="font-medium text-foreground">{str(row?.title) || `Fix ${idx + 1}`}</span>
                          <span>:</span>
                          <span>{str(row?.description) || "Add robustness evidence before deployment."}</span>
                          <span className="text-xs font-medium text-amber-300">({str(row?.priority) || "High"})</span>
                        </li>
                      );
                    })
                  ) : (
                    <>
                      <li className="flex flex-wrap items-baseline gap-x-1">
                        <span className="font-medium text-foreground">Statistical Significance</span>
                        <span>:</span>
                        <span>Extend test horizon and add less-correlated instruments.</span>
                        <span className="text-xs font-medium text-amber-300">(High)</span>
                      </li>
                      <li className="flex flex-wrap items-baseline gap-x-1">
                        <span className="font-medium text-foreground">Tail Risk</span>
                        <span>:</span>
                        <span>Add hard tail stop or reduce leverage.</span>
                        <span className="text-xs font-medium text-amber-300">(High)</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </AnalysisBlockCardLite>
      ) : null}
    </div>
  );
}
