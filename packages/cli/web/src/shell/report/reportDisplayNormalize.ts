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
  if (!buckets) return stringifyEdgeHalfLifeFields({ ...pro });
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
  return stringifyEdgeHalfLifeFields({
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
  const diagOut =
    diagnostics ??
    (maxSens > 0
      ? {
          parameterStabilityIndex: Math.max(0, Math.min(1, 1 - maxSens)),
        }
      : undefined);
  return {
    ...sens,
    parameters: normalizedParams,
    riskScore,
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
  const raw =
    kind === "optimization"
      ? p.optimizationReturn ?? p.optimization_return ?? o?.totalReturn ?? o?.total
      : p.validationReturn ?? p.validation_return ?? v?.totalReturn ?? v?.total;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
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
    return { opt, val };
  }
  for (const x of distOpt) {
    if (typeof x === "number" && Number.isFinite(x)) opt.push(x);
  }
  for (const x of distVal) {
    if (typeof x === "number" && Number.isFinite(x)) val.push(x);
  }
  return { opt, val };
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
  const nPair = Math.min(opt.length, val.length);

  const sumVal = val.length ? sumFinite(val) : null;
  const compoundOos = val.length ? compoundFromReturns(val) : undefined;

  if (out.totalOosReturn == null) {
    const sO = firstFinite(pro?.sumOos);
    if (sO != null) out.totalOosReturn = sO;
    else if (sumVal != null) out.totalOosReturn = sumVal;
    else if (compoundOos != null) out.totalOosReturn = compoundOos;
  }
  if (out.isAvgReturn == null) {
    const m = meanFinite(opt);
    if (m != null) out.isAvgReturn = m;
  }
  if (out.oosAvgReturn == null) {
    const m = meanFinite(val);
    if (m != null) out.oosAvgReturn = m;
  }
  if (out.oosWinRateText == null && val.length) {
    const wins = val.filter((x) => x > 0).length;
    out.oosWinRateText = `${wins} / ${val.length}`;
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
        if (opt[i]! > 0 && val[i] != null) posIs.push({ oos: val[i]! });
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
