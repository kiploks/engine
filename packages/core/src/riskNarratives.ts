import type { RiskAnalysisResult } from "./riskCore";

export function buildRiskNarratives(
  metrics: RiskAnalysisResult
): Record<string, unknown> {
  const {
    sharpeRatio,
    maxDrawdown,
    expectedShortfall95,
    var: var95,
    skewness,
    kurtosis,
    recoveryFactor,
    sortinoRatio,
  } = metrics;
  const winRate = metrics.metrics?.winRate;
  const profitFactor = metrics.metrics?.profitFactor;
  const edgeZ = metrics.edgeStabilityZScore;
  const dw = metrics.durbinWatson;
  const oosWindows = metrics.oosWindowCount ?? NaN;
  const totalTrades = metrics.totalTrades ?? NaN;

  const oosCvarUnreliable = (metrics as RiskAnalysisResult).oosCvar95Unreliable === true;
  const hasCore =
    Number.isFinite(sharpeRatio) &&
    Number.isFinite(maxDrawdown) &&
    (Number.isFinite(expectedShortfall95) || oosCvarUnreliable);

  if (!hasCore) return {};

  const ddAbs = Math.abs(maxDrawdown || 0);
  const esAbs = Number.isFinite(expectedShortfall95) ? Math.abs(expectedShortfall95 || 0) : (oosCvarUnreliable ? Math.abs(var95 || 0) : 0);
  const varAbs = Math.abs(var95 || 0);
  const tailSeverity =
    Number.isFinite(varAbs) && varAbs > 0
      ? oosCvarUnreliable ? 1 : (Number.isFinite(esAbs) ? esAbs / varAbs : NaN)
      : NaN;

  const isDegenerateTail = oosCvarUnreliable || (Number.isFinite(tailSeverity) && tailSeverity >= 0.99 && tailSeverity <= 1.05);
  // When CVaR is N/A use long paragraph so user understands degenerate tail (Option B-style explanation)
  const tailAuthority = oosCvarUnreliable
    ? "CVaR (ES) is unreliable - insufficient sample for robust ES estimation (e.g. single OOS window). VaR is reported; CVaR is not. In degenerate tail cases ES would equal VaR; we do not report a ratio when CVaR is unavailable. Both VaR and any reported tail metrics should be treated as lower-bound estimates only."
    : (isDegenerateTail || Number.isFinite(tailSeverity))
      ? isDegenerateTail
        ? "ES/VaR ratio near 1.0 - tail may be degenerate (e.g. very small sample). Interpret with caution."
        : tailSeverity > 1.5
        ? "Fat-tail danger: individual losses are significantly deeper than VaR threshold."
        : tailSeverity < 1.2
          ? "Stable tails: losses are tightly clustered around the threshold."
          : tailSeverity <= 1.7
            ? "Tail losses moderately exceed VaR; monitor fat-tail exposure."
            : "Tail losses materially exceed VaR; fat-tail risk is elevated."
      : undefined;

  // High period win rate with PF < 1: winning periods outweighed by larger losses - explicit explanation
  const highWrLowPf =
    Number.isFinite(winRate) && Number.isFinite(profitFactor) &&
    (winRate ?? 0) >= 0.75 && (profitFactor ?? 0) < 1;
  let riskAttribution: string | undefined =
    highWrLowPf
      ? `High period win rate (${((winRate ?? 0) * 100).toFixed(0)}%) with Profit Factor < 1: winning periods are outweighed by larger losses in losing periods. Strategy is unprofitable despite many winning periods.`
      : Number.isFinite(winRate) && Number.isFinite(profitFactor)
        ? winRate >= 0.55 && profitFactor >= 1.6
          ? "Edge driven by both hit-rate and payoff efficiency."
          : winRate >= 0.55
            ? "Edge driven primarily by hit-rate; payoff profile is modest."
            : profitFactor >= 1.6
              ? "Edge relies on payoff tail; hit-rate is lower."
              : "Edge profile is mixed with limited payoff buffer."
        : undefined;
  if (Number.isFinite(winRate) && winRate < 0.2) {
    riskAttribution = riskAttribution
      ? `${riskAttribution} High reliance on rare tail events.`
      : "High reliance on rare tail events.";
  }
  const pfAtCap = Number.isFinite(profitFactor) && (profitFactor ?? 0) >= 19.9;
  const lowWr = Number.isFinite(winRate) && (winRate ?? 0) < 0.2;
  if (pfAtCap && lowWr) {
    const pfStr = (profitFactor ?? 0).toFixed(1);
    const wrPct = ((winRate ?? 0) * 100).toFixed(0);
    riskAttribution = riskAttribution
      ? `${riskAttribution} Profit Factor (${pfStr}) is a mathematical artifact from extreme outlier dependency (Win Rate ${wrPct}%). These metrics are not suitable for capital allocation until sample size is sufficient.`
      : `Profit Factor (${pfStr}) is a mathematical artifact from extreme outlier dependency (Win Rate ${wrPct}%). These metrics are not suitable for capital allocation until sample size is sufficient.`;
  }

  let diagnosticNote: string | undefined;
  if (pfAtCap && lowWr) {
    const pfStr = (profitFactor ?? 0).toFixed(1);
    const wrPct = ((winRate ?? 0) * 100).toFixed(0);
    diagnosticNote = `Warning: Profit Factor (${pfStr}) is a mathematical artifact caused by Extreme Outlier Dependency (Win Rate ${wrPct}%).`;
    if (varAbs === 0 && Number.isFinite(sharpeRatio) && sharpeRatio > 0) {
      diagnosticNote += " The zero VaR/CVaR suggests a data hole in OOS windows.";
    }
    diagnosticNote += " These metrics are invalid for capital allocation until sample size is sufficient.";
  } else if (varAbs === 0 && Number.isFinite(sharpeRatio) && sharpeRatio > 0) {
    diagnosticNote =
      "Warning: VaR/CVaR are zero while volatility is positive - suggests a data hole in OOS windows. These metrics are invalid for capital allocation until sample size is sufficient.";
  }
  // Profit Factor < 1 implies negative mean; Sortino should be negative on the same series
  const pfSortinoContradiction =
    Number.isFinite(profitFactor ?? 0) &&
    (profitFactor ?? 0) < 1 &&
    Number.isFinite(sortinoRatio ?? 0) &&
    (sortinoRatio ?? 0) > 0.3;
  if (pfSortinoContradiction) {
    diagnosticNote = diagnosticNote
      ? `${diagnosticNote} Profit Factor and Sortino may be from different series or sample; interpret with caution.`
      : "Profit Factor and Sortino suggest different series or sample; interpret with caution.";
  }
  const payoffRatio = metrics.payoffRatio;
  if (typeof payoffRatio === "number" && Number.isFinite(payoffRatio) && payoffRatio < 0.2) {
    const payoffStr = payoffRatio.toFixed(2);
    riskAttribution = riskAttribution
      ? `${riskAttribution} Payoff Ratio (${payoffStr}) is very low - gains are small relative to losses.`
      : `Payoff Ratio (${payoffStr}) is very low - gains are small relative to losses.`;
    const payoffNote = "Payoff Ratio is very low (avg win is only a fraction of avg loss); gains are small relative to losses.";
    diagnosticNote = diagnosticNote ? `${diagnosticNote} ${payoffNote}` : payoffNote;
  }
  const rf = recoveryFactor;
  if (Number.isFinite(rf) && (rf as number) < 0) {
    const rfNote = "Negative Recovery Factor indicates the strategy has not recovered from max drawdown and is net negative.";
    diagnosticNote = diagnosticNote ? `${diagnosticNote} ${rfNote}` : rfNote;
  }

  const temporalStability =
    Number.isFinite(dw ?? 0) && Number.isFinite(edgeZ ?? 0)
      ? (edgeZ ?? 0) < 0
        ? "No positive edge; OOS mean return is negative. Re-evaluate strategy."
        : (dw ?? 0) >= 1.6 && (dw ?? 0) <= 2.4 && (edgeZ ?? 0) >= 1.5
          ? "Residuals show low autocorrelation and stable edge across windows."
          : (dw ?? 0) < 1.4 || (dw ?? 0) > 2.6
            ? "Residual autocorrelation detected; OOS stability is fragile."
            : "Edge stability is moderate; monitor window-to-window drift."
      : undefined;

  const lowPfKillSwitch = Number.isFinite(profitFactor ?? 0) && (profitFactor ?? 0) < 1.3;
  const smallSample = Number.isFinite(oosWindows) && oosWindows > 0 && oosWindows < 5;
  const isFatTail = Number.isFinite(kurtosis) && (kurtosis ?? 0) > 5;
  const hasStrongRF = Number.isFinite(recoveryFactor ?? 0) && (recoveryFactor ?? 0) >= 2;
  const useCautiousPass =
    !lowPfKillSwitch &&
    Number.isFinite(sharpeRatio) &&
    Number.isFinite(ddAbs) &&
    sharpeRatio >= 1.2 &&
    ddAbs <= 0.2 &&
    hasStrongRF &&
    (smallSample || isFatTail);

  const riskVerdict = (() => {
    if (Number.isFinite(oosWindows) && oosWindows < 2)
      return "Insufficient data - OOS metrics from 1 window are not statistically meaningful. Collect more walk-forward windows before interpreting.";
    if (!Number.isFinite(sharpeRatio) || !Number.isFinite(ddAbs)) return undefined;
    const pfVal = profitFactor ?? 0;
    if (lowPfKillSwitch)
      return Number.isFinite(pfVal) && pfVal < 1
        ? `FAIL - Strategy is already unprofitable gross of costs (Profit Factor ${pfVal.toFixed(2)}). Trading costs accelerate losses. No slippage headroom exists.`
        : "FAIL - Low Profit Factor; slippage of 10–15 bps would make strategy unprofitable.";
    if (useCautiousPass) return "CAUTIOUS PASS";
    if (sharpeRatio >= 1.2 && ddAbs <= 0.2)
      return "PASS - Risk profile aligns with deployable thresholds.";
    if (sharpeRatio >= 0.9 && ddAbs <= 0.3)
      return "CAUTION - Risk profile is acceptable but requires tight sizing.";
    return "FAIL - Risk profile is not stable enough for deployment.";
  })();

  let riskVerdictSections:
    | Array<{ type: "performance" | "sampleSize" | "tailRisk"; text: string }>
    | undefined;
  let riskRecommendation:
    | { status?: string; action?: string; maxLeverage?: string }
    | undefined;

  if (riskVerdict === "CAUTIOUS PASS") {
    riskVerdictSections = [
      {
        type: "performance",
        text: "Risk-adjusted metrics (Sharpe/Gain-to-Pain) are robust, and the edge shows structural integrity.",
      },
      {
        type: "sampleSize",
        text: `The Out-of-Sample history (${Math.round(oosWindows)} ${Math.round(oosWindows) === 1 ? "window" : "windows"}) is statistically thin. While current results are stable, they lack the historical depth to guarantee regime resilience.`,
      },
    ];
    if (isFatTail && Number.isFinite(kurtosis)) {
      const esVarRatio = Number.isFinite(tailSeverity) ? tailSeverity.toFixed(2) : "n/a";
      riskVerdictSections.push({
        type: "tailRisk",
        text: `High Kurtosis (${(kurtosis ?? 0).toFixed(2)}) and an ES/VaR ratio of ${esVarRatio}x indicate a "fat-tailed" profile. Expect infrequent but sharper-than-average drawdowns.`,
      });
    }
    riskRecommendation = {
      status: "Deployable with reduced initial size.",
      action: "Monitor Edge Stability (t); if it drops below 1.50, re-evaluate the model.",
      maxLeverage: "2x (Strict)",
    };
  }

  // N for context note: use n consistent with t = Sharpe * sqrt(n) so displayed N matches formula
  const nForContext =
    Number.isFinite(edgeZ) &&
    Number.isFinite(sharpeRatio) &&
    sharpeRatio !== 0
      ? Math.round((edgeZ / sharpeRatio) ** 2)
      : totalTrades;
  const displayN = Number.isFinite(nForContext) && nForContext > 0 ? nForContext : totalTrades;

  const contextNote =
    Number.isFinite(oosWindows) && oosWindows > 0
      ? oosWindows < 5
        ? `OOS metrics from ${oosWindows} ${oosWindows === 1 ? "window" : "windows"}${Number.isFinite(displayN) ? ` (N=${displayN} returns)` : ""} (small sample - interpret with caution).`
        : `OOS metrics computed across ${oosWindows} walk-forward validation windows.`
      : "OOS metrics computed on available walk-forward validation windows.";

  const riskRegimeContext = (() => {
    if (!Number.isFinite(ddAbs) || !Number.isFinite(sharpeRatio)) return undefined;
    const ddSeverity = ddAbs > 0.3 ? "high" : ddAbs > 0.15 ? "moderate" : "low";
    const sharpeLevel =
      sharpeRatio >= 1.5 ? "strong" : sharpeRatio >= 1.0 ? "adequate" : "weak";
    if (ddSeverity === "low" && sharpeLevel === "strong")
      return "Low regime sensitivity; drawdown variance explained by normal market fluctuations. Risk-adjusted performance is robust.";
    if (ddSeverity === "moderate")
      return `Moderate regime sensitivity (Max DD: ${(ddAbs * 100).toFixed(1)}%). Some drawdown variance driven by tail events or regime shifts.`;
    if (ddSeverity === "high")
      return `High drawdown (Max DD: ${(ddAbs * 100).toFixed(1)}%). Consider regime-dependent risk; do not infer volatility expectations without explicit volatility estimate.`;
    return `Regime context: Sharpe ${sharpeRatio.toFixed(2)}, Max DD ${(ddAbs * 100).toFixed(1)}%.`;
  })();

  const tailRiskProfile = (() => {
    const skew = skewness;
    const kurt = kurtosis;
    const tr = metrics.tailRatio;
    if (!Number.isFinite(skew) || !Number.isFinite(kurt)) return undefined;
    const s = skew ?? 0;
    const k = kurt ?? 0;
    // Do not show ES/VaR ratio when CVaR is suppressed as N/A (contradiction: CVaR = n/a but ratio 1.00x)
    const tailRatioNote = !oosCvarUnreliable && Number.isFinite(tailSeverity) ? ` ES/VaR ratio: ${tailSeverity.toFixed(2)}x.` : "";
    const smallSampleTailNote =
      Number.isFinite(oosWindows) && oosWindows < 5
        ? " Tail Ratio may be unreliable on small sample."
        : "";
    // Tail Ratio far from 1 => severe tail asymmetry; do not call "Near-Gaussian" (Gaussian has Tail Ratio ≈ 1)
    const tailRatioAsymmetric =
      typeof tr === "number" && Number.isFinite(tr) && (tr < 0.5 || tr > 2);
    if (tailRatioAsymmetric && typeof tr === "number") {
      const leftDominant = tr < 0.5;
      // Single source: 1/tailRatio for left-dominant (e.g. 0.14 -> 7.1x), tailRatio for right-dominant
      const tailMag = leftDominant ? (1 / tr).toFixed(1) : tr.toFixed(1);
      const desc = leftDominant
        ? `Left-tail dominant distribution. Tail Ratio (${tr.toFixed(2)}) indicates severe asymmetry - left tail is ~${tailMag}x larger than right tail.`
        : `Right-tail dominant distribution. Tail Ratio (${tr.toFixed(2)}) indicates severe asymmetry - right tail is ~${tailMag}x larger than left tail.`;
      return `${desc} Gaussian assumption does not apply. Skew: ${s.toFixed(2)}, Kurt: ${k.toFixed(1)}.${tailRatioNote}${smallSampleTailNote}`;
    }
    const asymmetricTailNote =
      typeof tr === "number" && Number.isFinite(tr)
        ? ` Asymmetric tails (Tail Ratio ${tr.toFixed(2)}); interpret with caution.`
        : "";
    // Sub-Gaussian only when excess kurtosis < 0 (thinner tails than normal). Do not show when k > 0.
    const isSubGaussian = Math.abs(s) < 0.5 && k < 0;
    // Excess kurtosis: 0 = normal; > 0 = fatter tails. "Near-normal" only when k < 1; k >= 1 is not near-normal (e.g. k=2.07 = moderate fat tails).
    const isNearGaussian = Math.abs(s) < 0.5 && k >= 0 && k < 1;
    const isModerateKurtosis = Math.abs(s) < 0.5 && k >= 1 && k < 4;
    const isFatTailK = k > 5;
    const isLeftSkewed = s < -1;
    const strategyFailing = (Number.isFinite(profitFactor ?? 0) && (profitFactor ?? 0) < 1) ||
      (typeof payoffRatio === "number" && Number.isFinite(payoffRatio) && payoffRatio < 0.2) ||
      (Number.isFinite(ddAbs) && ddAbs > 0.25);
    if (isSubGaussian)
      return `Sub-Gaussian distribution with controlled tails (Skew: ${s.toFixed(2)}, Kurt: ${k.toFixed(1)}).${tailRatioNote}${asymmetricTailNote}${smallSampleTailNote}`;
    if (isNearGaussian)
      return strategyFailing
        ? `Skew and kurtosis suggest near-normal shape (Skew: ${s.toFixed(2)}, Kurt: ${k.toFixed(1)}), but strategy is unprofitable or high drawdown; tail distribution is not the primary concern.${tailRatioNote}${asymmetricTailNote}${smallSampleTailNote}`
        : `Near-Gaussian distribution. Tail events are within expected bounds (Skew: ${s.toFixed(2)}, Kurt: ${k.toFixed(1)}).${tailRatioNote}${asymmetricTailNote}${smallSampleTailNote}`;
    if (isModerateKurtosis)
      return strategyFailing
        ? `Moderate excess kurtosis (${k.toFixed(2)}) - heavier tails than normal. Skew: ${s.toFixed(2)}. Strategy is unprofitable or high drawdown; tail distribution is not the primary concern.${tailRatioNote}${asymmetricTailNote}${smallSampleTailNote}`
        : `Moderate excess kurtosis (${k.toFixed(2)}) - heavier tails than normal (Skew: ${s.toFixed(2)}, Kurt: ${k.toFixed(1)}).${tailRatioNote}${asymmetricTailNote}${smallSampleTailNote}`;
    if (isFatTailK)
      return `Fat-tailed distribution (Kurtosis: ${k.toFixed(1)}). Elevated probability of extreme events.${tailRatioNote}${smallSampleTailNote}`;
    if (isLeftSkewed)
      return `Left-skewed distribution (Skew: ${s.toFixed(2)}). Negative tail risk elevated.${tailRatioNote}${smallSampleTailNote}`;
    return `Non-Gaussian distribution with localized kurtosis (${k.toFixed(1)}).${tailRatioNote}${smallSampleTailNote}`;
  })();

  const riskAssessment = (() => {
    if (Number.isFinite(oosWindows) && oosWindows < 2)
      return { status: "UNSTABLE" as const, note: "Insufficient data - single OOS window. Collect more walk-forward windows before interpreting.", maxLeverage: 1 };
    const rf = recoveryFactor;
    const sortino = sortinoRatio;
    if (!Number.isFinite(sharpeRatio) || !Number.isFinite(ddAbs)) return undefined;
    const smallSampleN = Number.isFinite(oosWindows) && oosWindows > 0 && oosWindows < 5;
    let status: "STABLE" | "CAUTION" | "UNSTABLE";
    let note: string;
    let maxLeverage: number | undefined;
    const hasStrongRFN = Number.isFinite(rf ?? 0) && (rf ?? 0) >= 2;
    const hasStrongSortino = Number.isFinite(sortino ?? 0) && (sortino ?? 0) >= 1.5;
    const lowPf = Number.isFinite(profitFactor ?? 0) && (profitFactor ?? 0) < 1.3;
    const impliedNetPct =
      Number.isFinite(rf ?? 0) && Number.isFinite(ddAbs) ? (rf ?? 0) * ddAbs * 100 : NaN;
    const weakProfit =
      Number.isFinite(impliedNetPct) &&
      impliedNetPct < 1 &&
      Number.isFinite(oosWindows) &&
      oosWindows >= 3;
    if (useCautiousPass) {
      status = "CAUTION";
      maxLeverage = 2.0;
      note = "Deployable with reduced initial size. Monitor Edge Stability (t); if it drops below 1.50, re-evaluate.";
    } else if (lowPf) {
      status = "UNSTABLE";
      maxLeverage = 1.0;
      const pfVal = profitFactor ?? 0;
      note = Number.isFinite(pfVal) && pfVal < 1
        ? `Strategy is already unprofitable gross of costs (Profit Factor ${pfVal.toFixed(2)}). Trading costs accelerate losses. No slippage headroom exists.`
        : "Low Profit Factor - slippage of 10–15 bps would make strategy unprofitable.";
    } else if (sharpeRatio >= 1.2 && ddAbs <= 0.2 && hasStrongRFN) {
      status = "STABLE";
      maxLeverage = hasStrongSortino && (rf ?? 0) >= 3 ? 2.0 : 1.5;
      note = smallSampleN
        ? `Strong metrics but sample size (${oosWindows} ${oosWindows === 1 ? "window" : "windows"}) is small - verify with more data.`
        : "Strong risk-adjusted metrics. Suitable for levered deployment.";
    } else if (sharpeRatio >= 0.9 && ddAbs <= 0.3) {
      status = "CAUTION";
      maxLeverage = 1.0;
      note = weakProfit
        ? `Low implied net profit (RF×DD ≈ ${impliedNetPct.toFixed(1)}%). Any execution error would destroy the strategy.`
        : smallSampleN
          ? `Acceptable metrics; small sample (${oosWindows} ${oosWindows === 1 ? "window" : "windows"}) - conservative sizing.`
          : "Acceptable risk profile with moderate drawdown exposure. Conservative sizing recommended.";
    } else {
      status = "UNSTABLE";
      note = smallSampleN
        ? `Sample too small (${oosWindows} ${oosWindows === 1 ? "window" : "windows"}) for robust verdict; metrics suggest further optimization.`
        : "Risk profile does not meet deployment thresholds. Further optimization required.";
    }
    return { status, note, maxLeverage };
  })();

  return {
    contextNote,
    tailAuthority,
    riskVerdict,
    riskAttribution,
    temporalStability,
    riskRegimeContext,
    tailRiskProfile,
    riskAssessment,
    riskVerdictSections,
    riskRecommendation,
    ...(diagnosticNote && { diagnosticNote }),
    ...(pfSortinoContradiction && { sortinoInconsistentWithPf: true }),
  };
}
