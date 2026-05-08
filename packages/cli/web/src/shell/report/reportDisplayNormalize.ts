import type { TestResultDataLite } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function firstFinite(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function meanFinite(vals: unknown[]): number | undefined {
  const nums = vals.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!nums.length) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sumFinite(vals: unknown[]): number | undefined {
  const nums = vals.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!nums.length) return undefined;
  return nums.reduce((a, b) => a + b, 0);
}

function stringifyEdgeHalfLifeFields(row: Record<string, unknown>): Record<string, unknown> {
  let edgeHalfLifeOut: unknown = row.edgeHalfLife ?? row.edgeHalfLifeDays;
  const ehObj = asRecord(edgeHalfLifeOut);
  if (ehObj && (ehObj.windows != null || ehObj.days != null)) {
    const w = firstFinite(ehObj.windows);
    const d = firstFinite(ehObj.days);
    const parts: string[] = [];
    if (w != null) parts.push(`${w} windows`);
    if (d != null) parts.push(`${d} days`);
    if (parts.length) edgeHalfLifeOut = parts.join(" / ");
  }
  return { ...row, edgeHalfLife: edgeHalfLifeOut };
}

/** Flatten engine `benchmarkMetricsBuckets` into legacy flat `proBenchmarkMetrics` fields the blocks UI reads. */
function mergeProBenchmarkMetrics(pro: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!pro) return null;
  const buckets = asRecord(pro.benchmarkMetricsBuckets);
  if (!buckets) {
    const base = stringifyEdgeHalfLifeFields({ ...pro });
    const triggers = Array.isArray(base.killSwitchTriggers)
      ? (base.killSwitchTriggers as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    const killLimit = firstFinite(base.killSwitchMaxOosDrawdownWindows);
    const synthesizedKillValue =
      killLimit != null ? `${Math.round(killLimit)} consecutive (all windows) (limit: ${Math.round(killLimit)})` : undefined;
    const verdictReason =
      typeof base.verdictReason === "string" && base.verdictReason.trim()
        ? (base.verdictReason as string)
        : triggers.length > 0
          ? `${base.killSwitchKilled === true ? "Immediate Kill Switch triggered. " : ""}${triggers.join("; ")}`
          : undefined;
    return {
      ...base,
      ...(typeof base.verdict !== "string" && base.killSwitchKilled === true ? { verdict: "REJECT" } : {}),
      ...(verdictReason ? { verdictReason } : {}),
      ...(base.killSwitchKilled === true
        ? { killSwitchValue: strOr(base.killSwitchValue, synthesizedKillValue ?? "TRIGGERED") }
        : {}),
      ...(triggers.length > 0
        ? { killSwitchHint: strOr(base.killSwitchHint, "Next OOS window in minus → turn off bot") }
        : {}),
    };
  }
  const oos = asRecord(buckets.oosEquityBased);
  const wpl = asRecord(buckets.wfaPeriodLevel);
  const wfeStd = firstFinite(wpl?.wfeStd);
  const wfeVarFromStd = wfeStd != null ? wfeStd * wfeStd : undefined;
  const pwRatio = firstFinite(wpl?.profitableWindowsRatio);
  const tw = firstFinite(wpl?.totalWindows);
  const pwc = firstFinite(wpl?.profitableWindowsCount);
  let profitableWindowsText: string | undefined;
  if (typeof pro.profitableWindowsText === "string" && pro.profitableWindowsText.trim()) {
    profitableWindowsText = pro.profitableWindowsText as string;
  } else if (pwRatio != null && tw != null) {
    const count = pwc ?? Math.round(pwRatio * tw);
    profitableWindowsText = `${count} / ${Math.round(tw)}`;
  }
  const merged = stringifyEdgeHalfLifeFields({
    ...pro,
    avgOosSharpe: firstFinite(pro.avgOosSharpe, oos?.oosSharpe),
    avgOosCalmar: firstFinite(pro.avgOosCalmar, oos?.oosCalmar),
    oosMaxDrawdown: firstFinite(pro.oosMaxDrawdown, oos?.oosMaxDrawdown),
    oosRetention: firstFinite(pro.oosRetention, wpl?.oosRetention),
    wfe: firstFinite(pro.wfe, wpl?.wfeMean),
    wfeMedian: firstFinite(pro.wfeMedian, wpl?.wfeMean),
    wfeVariance: firstFinite(pro.wfeVariance, wpl?.wfeVariance, wfeVarFromStd),
    psi: firstFinite(pro.psi, pro.parameterStabilityIndex),
    wfaWindows: firstFinite(pro.wfaWindows, wpl?.totalWindows, pro.windowsCount),
    relativeChange: firstFinite(pro.relativeChange, wpl?.relativeChange, pro.performanceDegradation),
    profitableWindowsText: profitableWindowsText ?? (typeof pro.profitableWindowsText === "string" ? pro.profitableWindowsText : undefined),
    trendMatch:
      typeof pro.trendMatch === "string"
        ? (pro.trendMatch as string)
        : typeof wpl?.oosIsTrendMatch === "boolean"
          ? wpl.oosIsTrendMatch
            ? "Aligned"
            : "Misaligned"
          : undefined,
    winRateChangePp: firstFinite(pro.winRateChangePp, wpl?.winRateDegradationPp),
  });
  const triggers = Array.isArray(merged.killSwitchTriggers)
    ? (merged.killSwitchTriggers as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const killLimit = firstFinite(merged.killSwitchMaxOosDrawdownWindows);
  const synthesizedKillValue =
    killLimit != null ? `${Math.round(killLimit)} consecutive (all windows) (limit: ${Math.round(killLimit)})` : undefined;
  const verdictReason =
    typeof merged.verdictReason === "string" && merged.verdictReason.trim()
      ? (merged.verdictReason as string)
      : triggers.length > 0
        ? `${merged.killSwitchKilled === true ? "Immediate Kill Switch triggered. " : ""}${triggers.join("; ")}`
        : undefined;
  return {
    ...merged,
    ...(typeof merged.verdict !== "string" && merged.killSwitchKilled === true ? { verdict: "REJECT" } : {}),
    ...(verdictReason ? { verdictReason } : {}),
    ...(merged.killSwitchKilled === true
      ? { killSwitchValue: strOr(merged.killSwitchValue, synthesizedKillValue ?? "TRIGGERED") }
      : {}),
    ...(triggers.length > 0
      ? { killSwitchHint: strOr(merged.killSwitchHint, "Next OOS window in minus → turn off bot") }
      : {}),
  };
}

function strOr(current: unknown, fallback: string): string {
  return typeof current === "string" && current.trim() ? current : fallback;
}

function mergeBenchmarkComparison(
  bench: Record<string, unknown> | null | undefined,
  proMerged: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!bench) return null;
  const buckets = asRecord(proMerged?.benchmarkMetricsBuckets);
  const fb = asRecord(buckets?.fullBacktestContext);
  return {
    ...bench,
    fullSharpe: firstFinite(bench.fullSharpe, fb?.fullSharpe),
    fullCalmar: firstFinite(bench.fullCalmar, fb?.fullCalmar),
    fullMaxDrawdown: firstFinite(bench.fullMaxDrawdown as number, fb?.fullMaxDrawdown),
  };
}

function normalizeRiskAnalysis(risk: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!risk) return null;
  const metrics = asRecord(risk.metrics);
  const var95 = firstFinite(risk.var95, risk.var);
  const cvar95 = firstFinite(risk.cvar95, risk.expectedShortfall95, risk.es95);
  const tradeWinRate = firstFinite(risk.tradeWinRate, metrics?.winRate);
  const profitFactor = firstFinite(risk.profitFactor, metrics?.profitFactor);
  const expectancy = firstFinite(risk.expectancy, metrics?.expectancy);
  const edgeT = firstFinite(risk.edgeStabilityT, risk.edgeStabilityZScore, risk.edgeStabilityTStat);
  const tailRatio = firstFinite(risk.tailRatio, metrics?.tailRatio);
  const periodWinRate = firstFinite(risk.periodWinRate, metrics?.periodWinRate);
  const payoffRatio = firstFinite(risk.payoffRatio, metrics?.payoffRatio);
  const verdict = typeof risk.verdict === "string" ? risk.verdict : typeof risk.riskVerdict === "string" ? risk.riskVerdict : undefined;
  return {
    ...risk,
    var95,
    cvar95,
    tradeWinRate,
    profitFactor,
    expectancy,
    edgeStabilityT: edgeT,
    tailRatio,
    periodWinRate,
    payoffRatio,
    ...(verdict ? { verdict } : {}),
  };
}

function normalizeParameterSensitivity(sens: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!sens) return null;
  const params = Array.isArray(sens.parameters) ? (sens.parameters as unknown[]) : [];
  const normalizedParams = params.map((p) => {
    const o = asRecord(p);
    if (!o) return p;
    const optimal = o.optimal ?? o.bestValue ?? o.optimalValue;
    const status =
      typeof o.status === "string"
        ? o.status
        : typeof o.sensitivity === "number" && o.sensitivity >= 0.6
          ? "Fragile"
          : o.overfittingRisk === true
            ? "Fragile"
            : "Stable";
    return { ...o, optimal, status };
  });
  let riskScore = sens.riskScore;
  if (typeof riskScore !== "number" || !Number.isFinite(riskScore)) {
    const svals = normalizedParams
      .map((x) => (typeof (x as { sensitivity?: number }).sensitivity === "number" ? (x as { sensitivity: number }).sensitivity : NaN))
      .filter((n) => Number.isFinite(n));
    if (svals.length > 0) {
      const avg = svals.reduce((a, b) => a + b, 0) / svals.length;
      riskScore = Math.max(0, Math.min(100, Math.round(100 - avg * 100)));
    }
  }
  const diagnostics =
    asRecord(sens.diagnostics) ??
    (typeof (sens as { parameterStabilityIndex?: number }).parameterStabilityIndex === "number"
      ? { parameterStabilityIndex: (sens as { parameterStabilityIndex: number }).parameterStabilityIndex }
      : undefined);
  const maxSens = normalizedParams.reduce((m, x) => {
    const s = (x as { sensitivity?: number }).sensitivity;
    return typeof s === "number" && Number.isFinite(s) ? Math.max(m, s) : m;
  }, 0);
  const highestSensitivityParam = normalizedParams.reduce((best, x) => {
    const s = (x as { sensitivity?: number }).sensitivity;
    if (typeof s !== "number" || !Number.isFinite(s)) return best;
    if (!best || s > best.sensitivity) {
      const name = typeof (x as { name?: string }).name === "string" ? (x as { name: string }).name : "param";
      const label = typeof (x as { displayLabel?: string }).displayLabel === "string" ? (x as { displayLabel: string }).displayLabel : "Stable";
      return { name, sensitivity: s, label };
    }
    return best;
  }, null as { name: string; sensitivity: number; label: string } | null);
  const diagOut =
    diagnostics ??
    (maxSens > 0
      ? {
          parameterStabilityIndex: Math.max(0, Math.min(1, 1 - maxSens)),
        }
      : undefined);
  const signalAttenuation = firstFinite((sens as { signalAttenuation?: number }).signalAttenuation, diagOut?.signalAttenuation);
  const sharpeRetention = firstFinite((sens as { sharpeRetention?: number }).sharpeRetention, diagOut?.sharpeRetention);
  const sharpeDrift = firstFinite((sens as { sharpeDrift?: number }).sharpeDrift, diagOut?.sharpeDriftPct);
  const maxTailRiskReduction = firstFinite((sens as { maxTailRiskReduction?: number }).maxTailRiskReduction, diagOut?.maxTailRiskReduction);
  const deploymentStatus = typeof (sens as { deploymentStatus?: string }).deploymentStatus === "string"
    ? String((sens as { deploymentStatus?: string }).deploymentStatus)
    : typeof diagOut?.deploymentStatus === "string"
      ? String(diagOut.deploymentStatus)
      : undefined;
  const performanceDecayPct = firstFinite(diagOut?.performanceDecayPct);
  const performanceDecayNote = performanceDecayPct != null
    ? `${performanceDecayPct.toFixed(1)}% (REJECTED if >= 80%).`
    : undefined;
  const baseScore = firstFinite((sens as { baseScore?: number }).baseScore, diagOut?.riskScoreBase);
  const penalty = firstFinite((sens as { penalty?: number }).penalty, diagOut?.riskScorePenalty);
  const riskScoreResolved = firstFinite((sens as { riskScore?: number }).riskScore, diagOut?.aggregateRiskScore, riskScore);
  const riskClass = (() => {
    if (riskScoreResolved == null) return undefined;
    if (riskScoreResolved < 50) return "HIGH";
    if (riskScoreResolved < 65) return "MODERATE";
    return "LOW";
  })();
  const riskScoreFormula =
    baseScore != null && penalty != null
      ? `Base ${Math.round(baseScore)} − Penalty ${Math.round(penalty)} →`
      : undefined;
  const proNote = highestSensitivityParam
    ? `Highest sensitivity: ${highestSensitivityParam.name} (${highestSensitivityParam.sensitivity.toFixed(2)}, ${highestSensitivityParam.label}).`
    : undefined;
  const couplingSummary =
    typeof (sens as { couplingSummary?: string }).couplingSummary === "string" && String((sens as { couplingSummary?: string }).couplingSummary).trim()
      ? String((sens as { couplingSummary?: string }).couplingSummary)
      : "Coupling analysis: No dominant unstable interactions detected.";
  return {
    ...sens,
    parameters: normalizedParams,
    ...(riskScoreResolved != null ? { riskScore: riskScoreResolved } : {}),
    ...(riskClass ? { riskClass } : {}),
    ...(riskScoreFormula ? { riskScoreFormula } : {}),
    ...(baseScore != null ? { baseScore } : {}),
    ...(penalty != null ? { penalty } : {}),
    ...(signalAttenuation != null ? { signalAttenuation } : {}),
    ...(sharpeRetention != null ? { sharpeRetention } : {}),
    ...(sharpeDrift != null ? { sharpeDrift } : {}),
    ...(maxTailRiskReduction != null ? { maxTailRiskReduction } : {}),
    ...(deploymentStatus ? { deploymentStatus } : {}),
    ...(performanceDecayNote ? { performanceDecayNote } : {}),
    ...(proNote ? { proNote } : {}),
    ...(couplingSummary ? { couplingSummary } : {}),
    ...(diagOut ? { diagnostics: diagOut } : {}),
  };
}

function normalizeTurnoverAndCostDrag(toc: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!toc) return null;
  const decomp = asRecord(toc.costDecomposition);
  const status = asRecord(toc.status);
  const feesPct = firstFinite(decomp?.exchangeFeesPct);
  const slipPct = firstFinite(decomp?.slippagePct);
  const exchangeFeesCagr = firstFinite(toc.exchangeFeesCagr, feesPct != null ? feesPct / 100 : undefined);
  const slippageCagr = firstFinite(toc.slippageCagr, slipPct != null ? slipPct / 100 : undefined);
  const costEdgeRatioText =
    typeof toc.costEdgeRatioText === "string"
      ? (toc.costEdgeRatioText as string)
      : typeof toc.costEdgeRatioPct === "number"
        ? `${(toc.costEdgeRatioPct as number).toFixed(1)}%`
        : undefined;
  const avgHoldingHours = firstFinite(toc.avgHoldingHours, toc.avgHoldingTimeHours);
  const turnoverNum = firstFinite(toc.turnover, toc.annualTurnover);
  const costAdaptability =
    typeof toc.costAdaptability === "string"
      ? (toc.costAdaptability as string)
      : typeof status?.costAdaptability === "string"
        ? (status.costAdaptability as string)
        : undefined;
  const marketImpactText =
    typeof toc.marketImpactText === "string"
      ? (toc.marketImpactText as string)
      : typeof asRecord(toc.marketImpactModel)?.assumption === "string"
        ? String(asRecord(toc.marketImpactModel)?.assumption)
        : undefined;
  return {
    ...toc,
    ...(exchangeFeesCagr != null ? { exchangeFeesCagr } : {}),
    ...(slippageCagr != null ? { slippageCagr } : {}),
    ...(costEdgeRatioText != null ? { costEdgeRatioText } : {}),
    ...(avgHoldingHours != null ? { avgHoldingHours } : {}),
    ...(turnoverNum != null ? { turnover: turnoverNum } : {}),
    ...(costAdaptability != null ? { costAdaptability } : {}),
    ...(marketImpactText != null ? { marketImpactText } : {}),
  };
}

function normalizeRobustnessScore(rs: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!rs) return null;
  return { ...rs };
}

/** Coerce nested SaaS `professional` objects to short strings the blocks UI displays. */
function summarizeProfessionalSub(prof: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prof };
  if (typeof out.grade !== "string" && typeof out.institutionalGrade === "string") {
    out.grade = out.institutionalGrade;
  }
  if (typeof out.gradeOverride !== "string" && typeof out.institutionalGradeOverrideReason === "string") {
    out.gradeOverride = `(override: ${out.institutionalGradeOverrideReason})`;
  }
  if (typeof out.regime !== "string") {
    const ra = asRecord(out.regimeAnalysis);
    if (ra) {
      const bits = [ra.verdict, ra.distributionShape].filter((x) => typeof x === "string");
      if (bits.length) out.regime = bits.join(" - ");
    }
  }
  if (typeof out.monteCarlo !== "string") {
    const mv = asRecord(out.monteCarloValidation);
    if (mv) {
      const v = mv.verdict != null ? String(mv.verdict) : "";
      const ppos = firstFinite(mv.probabilityPositive);
      const method = typeof mv.method === "string" && mv.method.length ? mv.method : "";
      const parts = [
        v,
        ppos != null ? `P(positive)=${(ppos * 100).toFixed(0)}%` : "",
        method ? `(method: ${method})` : "",
      ].filter((s) => s.length > 0);
      if (parts.length) out.monteCarlo = parts.join(" ");
    }
  }
  if (typeof out.stress !== "string") {
    const st = asRecord(out.stressTest);
    if (st?.verdict != null) {
      const v = String(st.verdict);
      const rec = (st as { recoveryCapability?: string }).recoveryCapability;
      out.stress = [v, rec != null && String(rec).length ? `(recovery: ${rec})` : ""]
        .filter((s) => s.length > 0)
        .join(" ");
    }
  }
  if (typeof out.wfeAdvanced !== "string") {
    const wa = asRecord(out.wfeAdvanced);
    if (wa) {
      const v = wa.verdict != null ? String(wa.verdict) : "";
      const comp = firstFinite(wa.compositeScore, (wa as { score?: number }).score);
      const pr = firstFinite((wa as { permutationPValue?: number }).permutationPValue);
      const parts = [
        v,
        comp != null ? `score ${comp}` : "",
        pr != null ? `p=${(pr * 100).toFixed(1)}%` : "",
      ].filter((s) => s.length > 0);
      if (parts.length) out.wfeAdvanced = parts.join(" ");
    }
  }
  if (typeof out.equityCurve !== "string") {
    const ec = asRecord(out.equityCurveAnalysis);
    if (ec?.verdict != null) out.equityCurve = String(ec.verdict);
  }
  return out;
}

function synthesizeProfessionalWfaFallback(
  wfaOut: Record<string, unknown>,
  pro: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const verdict = typeof wfaOut.verdict === "string" ? String(wfaOut.verdict).toUpperCase() : "";
  const failed = asRecord(wfaOut.failedWindows);
  const failedCount = firstFinite(failed?.count);
  const failedTotal = firstFinite(failed?.total, wfaOut.windowsCount);
  const failureRate =
    failedCount != null && failedTotal != null && failedTotal > 0
      ? failedCount / failedTotal
      : undefined;
  const shouldCapGrade = verdict === "FAIL" && failureRate != null && failureRate > 0.3;

  const grade = shouldCapGrade ? "BBB - RESEARCH ONLY" : undefined;
  const gradeOverride = shouldCapGrade
    ? "(override: Verdict FAIL and failure rate > 30%; grade capped to BBB - RESEARCH ONLY.)"
    : undefined;
  const recommendation = shouldCapGrade
    ? "Research only. Do not deploy to production without further validation."
    : "Recommendation unavailable.";

  const wfeAdvancedFromPro = asRecord(pro?.wfeAdvanced);
  const wfeAdvanced =
    wfeAdvancedFromPro != null
      ? summarizeProfessionalSub({ wfeAdvanced: wfeAdvancedFromPro }).wfeAdvanced
      : undefined;

  return {
    ...(grade ? { grade } : {}),
    ...(gradeOverride ? { gradeOverride } : {}),
    recommendation,
    ...(typeof wfeAdvanced === "string" ? { wfeAdvanced } : {}),
  };
}

function patchDistributionAliases(dist: Record<string, unknown>): Record<string, unknown> {
  const worst5 = firstFinite(dist.worst5Percent, dist.worst5);
  const best95 = firstFinite(dist.best95Percent, dist.best95);
  return {
    ...dist,
    ...(worst5 != null ? { worst5Percent: worst5 } : {}),
    ...(best95 != null ? { best95Percent: best95 } : {}),
  };
}

function normalizeMonteCarloSection(mc: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!mc) return null;
  const out: Record<string, unknown> = { ...mc };
  const cagr = asRecord(mc.cagrDistribution);
  const dd = asRecord(mc.drawdownDistribution);
  if (cagr) out.cagrDistribution = patchDistributionAliases(cagr);
  if (dd) out.drawdownDistribution = patchDistributionAliases(dd);
  return out;
}

/** Derive flat WFA summary fields when integration only sends `distribution`, `periods`, or nested `professional`. */
function toWindowDecimalReturn(
  p: Record<string, unknown> | null | undefined,
  kind: "optimization" | "validation",
): number | null {
  if (!p) return null;
  const m = p.metrics as Record<string, unknown> | undefined;
  const o = m?.optimization as Record<string, unknown> | undefined;
  const v = m?.validation as Record<string, unknown> | undefined;
  const directRaw =
    kind === "optimization"
      ? p.optimizationReturn ?? p.optimization_return
      : p.validationReturn ?? p.validation_return;
  const metricsRaw = kind === "optimization" ? o?.totalReturn ?? o?.total : v?.totalReturn ?? v?.total;
  const asFinite = (x: unknown): number | null => {
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string" && x.trim() && Number.isFinite(Number(x))) return Number(x);
    return null;
  };
  const toDecimal = (x: number): number => (Math.abs(x) > 1 ? x / 100 : x);
  const direct = asFinite(directRaw);
  const metrics = asFinite(metricsRaw);
  const metricsDec = metrics != null ? toDecimal(metrics) : null;
  if (direct != null && metricsDec != null) {
    /**
     * Cloud reports may preserve richer period metrics while local payload can carry already-normalized
     * shorthand fields. If metrics-derived value is materially larger (x10+), prefer it for parity.
     */
    if (Math.abs(metricsDec) >= Math.max(0.1, Math.abs(direct) * 10)) return metricsDec;
    return direct;
  }
  if (direct != null) return direct;
  if (metricsDec != null) return metricsDec;
  return null;
}

/**
 * Pairs of IS / OOS returns from WFA `windows` or `periods` (transform output), merged with
 * `distribution.*Returns` when present.
 */
function collectWfaWindowReturnArrays(
  wfa: Record<string, unknown>,
  distOpt: unknown[],
  distVal: unknown[],
): { opt: number[]; val: number[] } {
  const distOptNums = distOpt.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const distValNums = distVal.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const opt: number[] = [];
  const val: number[] = [];
  const rows = Array.isArray(wfa.windows)
    ? (wfa.windows as unknown[])
    : Array.isArray(wfa.periods)
      ? (wfa.periods as unknown[])
      : [];
  if (rows.length) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const p = row as Record<string, unknown>;
      const oR = toWindowDecimalReturn(p, "optimization");
      const vR = toWindowDecimalReturn(p, "validation");
      if (oR != null) opt.push(oR);
      if (vR != null) val.push(vR);
    }
    /**
     * If distribution series exists and materially disagrees with row shorthand returns,
     * trust distribution as canonical (cloud parity). This fixes x100 drift where local
     * shorthand fields are reduced but distribution carries full-fidelity period returns.
     */
    if (
      distOptNums.length === opt.length &&
      distValNums.length === val.length &&
      opt.length > 0 &&
      val.length > 0
    ) {
      const optRowAbs = meanFinite(opt.map((x) => Math.abs(x))) ?? 0;
      const valRowAbs = meanFinite(val.map((x) => Math.abs(x))) ?? 0;
      const optDistAbs = meanFinite(distOptNums.map((x) => Math.abs(x))) ?? 0;
      const valDistAbs = meanFinite(distValNums.map((x) => Math.abs(x))) ?? 0;
      const optScaleMismatch = optDistAbs >= Math.max(0.1, optRowAbs * 10);
      const valScaleMismatch = valDistAbs >= Math.max(0.1, valRowAbs * 10);
      if (optScaleMismatch || valScaleMismatch) {
        return { opt: distOptNums, val: distValNums };
      }
    }
    return { opt, val };
  }
  return { opt: distOptNums, val: distValNums };
}

function compoundFromReturns(decimals: number[]): number | undefined {
  if (!decimals.length) return undefined;
  let p = 1;
  for (const d of decimals) {
    if (typeof d === "number" && Number.isFinite(d)) p *= 1 + d;
  }
  if (!Number.isFinite(p)) return undefined;
  return p - 1;
}

function toBalanceNum(point: unknown): number | undefined {
  if (point == null) return undefined;
  if (typeof point === "number" && Number.isFinite(point)) return point;
  const rec = asRecord(point);
  const raw = rec?.value ?? rec?.balance ?? rec?.equity;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function extractScaledReturnsFromPerformanceTransfer(
  wfa: Record<string, unknown>,
): { opt: number[]; val: number[]; total?: number } | null {
  const pt = asRecord(wfa.performanceTransfer);
  const wins = Array.isArray(pt?.windows) ? (pt?.windows as unknown[]) : [];
  if (!wins.length) return null;
  const opt: number[] = [];
  const val: number[] = [];
  let compoundedPath = 1;
  for (const w of wins) {
    const wr = asRecord(w);
    const isCurve = Array.isArray(wr?.isEquityCurve) ? (wr?.isEquityCurve as unknown[]) : [];
    const oosCurve = Array.isArray(wr?.oosEquityCurve) ? (wr?.oosEquityCurve as unknown[]) : [];
    if (!isCurve.length || !oosCurve.length) continue;
    const isStart = toBalanceNum(isCurve[0]);
    const isEnd = toBalanceNum(isCurve[isCurve.length - 1]);
    const oosStart = toBalanceNum(oosCurve[0]);
    const oosEnd = toBalanceNum(oosCurve[oosCurve.length - 1]);
    if (
      isStart == null ||
      isEnd == null ||
      oosStart == null ||
      oosEnd == null ||
      isStart === 0 ||
      oosStart === 0
    ) {
      continue;
    }
    /**
     * Cloud WFA display currently expects period returns in "percent-points" scale here.
     * Example: 1000 -> 1009.49 becomes 94.9 (not 0.949).
     */
    const isScaled = ((isEnd / isStart) - 1) * 100;
    const oosScaled = ((oosEnd / oosStart) - 1) * 100;
    opt.push(isScaled);
    val.push(oosScaled);
    /**
     * Cloud WFA total in this mode reflects compounded IS+OOS path per window,
     * not OOS-only return.
     */
    compoundedPath *= (1 + isScaled / 100) * (1 + oosScaled / 100);
  }
  if (!opt.length || !val.length) return null;
  const total =
    Number.isFinite(compoundedPath) && compoundedPath > 0
      ? (compoundedPath - 1) * 100
      : undefined;
  return { opt, val, total };
}

/**
 * `performanceDegradation` is canonical; `degradationRatio` in some payloads is OOS retention. Prefer the former.
 */
function pickPerformanceDegradationForDisplay(
  wfa: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  const canon = firstFinite(
    wfa.performanceDegradation,
    wfa.degradationForDisplay,
    (out as { performanceDegradation?: number }).performanceDegradation,
  );
  if (canon != null) {
    out.degradationForDisplay = canon;
    (out as { performanceDegradation?: number }).performanceDegradation = canon;
  }
}

function normalizeWalkForwardAnalysis(
  wfa: Record<string, unknown> | null | undefined,
  pro: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!wfa) return null;
  const out: Record<string, unknown> = { ...wfa };
  const dist = asRecord(wfa.distribution);
  const distOpt = dist && Array.isArray(dist.optimizationReturns) ? dist.optimizationReturns : [];
  const distVal = dist && Array.isArray(dist.validationReturns) ? dist.validationReturns : [];
  const { opt, val } = collectWfaWindowReturnArrays(wfa, distOpt, distVal);
  const perfScaled = extractScaledReturnsFromPerformanceTransfer(wfa);
  const shouldUsePerfScaled =
    perfScaled != null &&
    opt.length === perfScaled.opt.length &&
    val.length === perfScaled.val.length &&
    opt.length > 0 &&
    val.length > 0 &&
    (meanFinite(opt.map((x) => Math.abs(x))) ?? 0) < 0.2 &&
    (meanFinite(val.map((x) => Math.abs(x))) ?? 0) < 0.2;
  const effOpt = shouldUsePerfScaled ? perfScaled!.opt : opt;
  const effVal = shouldUsePerfScaled ? perfScaled!.val : val;
  const rowKey = Array.isArray(wfa.windows) ? "windows" : Array.isArray(wfa.periods) ? "periods" : null;
  if (rowKey && Array.isArray(out[rowKey]) && effOpt.length > 0 && effVal.length > 0) {
    const rows = out[rowKey] as unknown[];
    if (rows.length === effOpt.length && rows.length === effVal.length) {
      out[rowKey] = rows.map((row, i) => {
        const rec = asRecord(row);
        if (!rec) return row;
        return {
          ...rec,
          optimizationReturn: effOpt[i],
          validationReturn: effVal[i],
        };
      });
    }
  }
  const nPair = Math.min(effOpt.length, effVal.length);

  const sumVal = effVal.length ? sumFinite(effVal) : null;
  const compoundOos = effVal.length ? compoundFromReturns(effVal) : undefined;

  if (out.totalOosReturn == null) {
    const sO = firstFinite(pro?.sumOos);
    if (sO != null) out.totalOosReturn = sO;
    else if (sumVal != null) out.totalOosReturn = sumVal;
    else if (compoundOos != null) out.totalOosReturn = compoundOos;
  }
  if (out.isAvgReturn == null) {
    const m = meanFinite(effOpt);
    if (m != null) out.isAvgReturn = m;
  }
  if (out.oosAvgReturn == null) {
    const m = meanFinite(effVal);
    if (m != null) out.oosAvgReturn = m;
  }
  if (out.oosWinRateText == null && effVal.length) {
    const wins = effVal.filter((x) => x > 0).length;
    out.oosWinRateText = `${wins} / ${effVal.length}`;
  }
  if (shouldUsePerfScaled && perfScaled?.total != null) {
    const currentTotal = firstFinite(out.totalOosReturn);
    /**
     * In x100 mismatch cases local `sumOos` may already set totalOosReturn to a tiny decimal-derived value
     * (e.g. 0.0201 => 2.0%). Prefer performanceTransfer-derived total to match cloud display scale.
     */
    if (
      currentTotal == null ||
      Math.abs(perfScaled.total) >= Math.max(0.1, Math.abs(currentTotal) * 10)
    ) {
      out.totalOosReturn = perfScaled.total;
    }
  }
  if (out.overfittingScore == null) {
    const of = asRecord(wfa.overfittingRisk);
    if (of) {
      const lev = typeof of.level === "string" ? of.level : "";
      const sc = firstFinite(of.score);
      const parts = [lev, sc != null ? String(sc) : ""].filter((s) => s.length > 0);
      if (parts.length) out.overfittingScore = parts.join(" ");
    }
  }
  if (out.consistencyText == null) {
    if (nPair > 0) {
      const posIs = [];
      for (let i = 0; i < nPair; i++) {
        if (effOpt[i]! > 0 && effVal[i] != null) posIs.push({ oos: effVal[i]! });
      }
      if (posIs.length) {
        const oosPos = posIs.filter((x) => x.oos > 0).length;
        out.consistencyText = `${((oosPos / posIs.length) * 100).toFixed(0)}% (${oosPos}/${posIs.length})`;
      }
    }
    if (out.consistencyText == null && typeof wfa.consistency === "number") {
      out.consistencyText = `${(wfa.consistency * 100).toFixed(0)}%`;
    }
  }
  pickPerformanceDegradationForDisplay(wfa, out);
  const failed = asRecord(wfa.failedWindows);
  if (failed) {
    const total = firstFinite(failed.total);
    if (out.windowsCount == null && total != null) out.windowsCount = total;
    if (typeof failed.text !== "string") {
      const c = firstFinite(failed.count);
      if (c != null && total != null) out.failedWindows = { ...failed, text: `${Math.round(c)} / ${Math.round(total)}` };
    }
  }
  const prof = asRecord(wfa.professional);
  if (prof) {
    let summarized = summarizeProfessionalSub(prof);
    const profMeta = asRecord(wfa.professionalMeta);
    const au = profMeta?.approximationsUsed;
    if (typeof summarized.equityCurve !== "string" && Array.isArray(au) && au.length && typeof au[0] === "string") {
      summarized = { ...summarized, equityCurve: au[0] as string };
    }
    out.professional = summarized;
  } else {
    const synthesized = synthesizeProfessionalWfaFallback(out, pro);
    if (synthesized) out.professional = synthesized;
  }
  return out;
}

/**
 * Aligns `TestResultDataLite` with shapes produced by engine / SaaS integration payloads
 * so block UI reads consistent flat fields (Quick Win pro metrics, VaR aliases, turnover hints).
 */
export function normalizeReportForBlockView(lite: TestResultDataLite): TestResultDataLite {
  const proMerged = mergeProBenchmarkMetrics(asRecord(lite.proBenchmarkMetrics as unknown));
  const benchMerged = mergeBenchmarkComparison(asRecord(lite.benchmarkComparison as unknown), proMerged);
  return {
    ...lite,
    proBenchmarkMetrics: proMerged,
    benchmarkComparison: benchMerged,
    walkForwardAnalysis: normalizeWalkForwardAnalysis(asRecord(lite.walkForwardAnalysis as unknown), proMerged),
    monteCarloSimulation: normalizeMonteCarloSection(asRecord(lite.monteCarloSimulation as unknown)),
    monteCarloValidation: normalizeMonteCarloSection(asRecord(lite.monteCarloValidation as unknown)),
    riskAnalysis: normalizeRiskAnalysis(asRecord(lite.riskAnalysis as unknown)),
    parameterSensitivity: normalizeParameterSensitivity(asRecord(lite.parameterSensitivity as unknown)),
    turnoverAndCostDrag: normalizeTurnoverAndCostDrag(asRecord(lite.turnoverAndCostDrag as unknown)),
    robustnessScore: lite.robustnessScore == null ? null : normalizeRobustnessScore(asRecord(lite.robustnessScore as unknown)),
  };
}
