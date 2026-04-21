# Kiploks Engine (Open Core)

## New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

![Kiploks UI preview](https://kiploks.com/video/kiploks-ui-sm.gif)

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and `top_n` modes.

Demo video: [kiploks-ui.mp3](https://kiploks.com/video/kiploks-ui.mp3)

[![npm](https://img.shields.io/npm/v/@kiploks/engine-core)](https://www.npmjs.com/package/@kiploks/engine-core)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Your backtest looked great. Then it failed live. This is why - and how to check before you deploy.**

Kiploks Engine is an open-source TypeScript library that tells you whether your trading strategy is genuinely robust or just curve-fitted to historical data. It runs **walk-forward analysis (WFA)**, detects overfitting, and returns a clear verdict - `ROBUST`, `ACCEPTABLE`, `WEAK`, or `FAIL` - with the math to back it up.

Same methodology powers [Kiploks](https://kiploks.com) in the cloud.

---

## The problem this solves

Most backtests lie. Not because the data is wrong, but because the strategy was tuned - consciously or not - to fit the past. The result looks profitable on paper, fails in live trading, and you have no way to know upfront which outcome you'll get.

Walk-forward analysis is the standard solution: test on data the optimizer never saw. But doing it correctly - with the right statistical tests, reproducible results, and a defensible verdict - requires more than a loop over your data.

That's what this engine does.

---

## Who this is for

**Freqtrade / OctoBot users** - optional **Python bridges** in separate repos send backtests to [Kiploks](https://kiploks.com) without installing this npm stack (see [Bot integrations](#bot-integrations-freqtrade-octobot) below). For **local** analysis, export to CSV and use `@kiploks/engine-adapters`, use `@kiploks/engine-cli`, or map your trades to `Trade[]` yourself. **Jesse** and other bots: same idea - no first-party adapter ships inside this repository.

**Quant developers** - integrate the engine into your own pipeline. Full TypeScript types, deterministic output, versioned contracts.

**Library builders** - embed the engine in your own analysis tools. Apache 2.0, zero vendor lock-in.

**Non-coders who understand strategy research** - use the [Kiploks platform](https://kiploks.com) which runs the same engine with a full UI.

---

## What you get

Run `analyze()` on a list of trades for **summary + metadata** (`totalTrades`, `netProfit`, hashes, versions). For **walk-forward style output**, use `analyzeFromTrades()` (timestamped trades) or `analyzeFromWindows()` (precomputed windows). Example shape:

```
wfe.verdict:     ROBUST          ← did the strategy transfer from IS to OOS?
wfe.rankWfe:     1.73            ← how well, quantitatively
wfe.permutationPValue: 0.04      ← is this statistically significant?
robustnessScore: 78              ← 0-100 aggregate across all checks
```

Run `buildPathMonteCarloSimulation()` on an equity curve and get:

```
cagrDistribution: { p5: -4.2%, p50: 18.7%, p95: 41.3% }   ← range of outcomes
probabilityPositive: 0.89                                   ← 89% of paths are profitable
pathStability: MEDIUM
tailRisk: LOW
```

Run `runProfessionalWfa()` on walk-forward windows and get a full institutional report:

```
institutionalGrade: "AA - PROFESSIONAL"
equityCurveAnalysis.verdict: STRONG
monteCarloValidation.verdict: CONFIDENT
parameterStability.overallStability: ROBUST
stressTest.verdict: RESILIENT
```

---

## Quickstart - 2 minutes

### Install

```bash
npm install @kiploks/engine-core @kiploks/engine-contracts
```

### Option A: I have a list of trades

```ts
import { analyze } from "@kiploks/engine-core";

const result = analyze(
  {
    strategyId: "my-strategy",
    trades: [
      { profit: 0.05, openTime: 1700000000000, closeTime: 1700086400000 },
      { profit: -0.02, openTime: 1700100000000, closeTime: 1700186400000 },
      // ... more trades
    ],
  },
  { seed: 42, decimals: 8 },
);

console.log(result.summary); // { totalTrades, netProfit, avgTradeProfit }
console.log(result.metadata); // { engineVersion, formulaVersion, inputHash, seed }
```

### Option B: I have trades with timestamps and want WFA

```ts
import { analyzeFromTrades } from "@kiploks/engine-core";

const result = analyzeFromTrades(
  {
    trades, // each needs openTime + closeTime in Unix ms
    windowConfig: {
      inSampleMonths: 3,
      outOfSampleMonths: 1,
      stepMode: "rolling",
    },
    wfaInputMode: "tradeSlicedPseudoWfa",
  },
  { seed: 42 },
);

console.log(result.wfe);
// {
//   rankWfe: 1.73,
//   permutationPValue: 0.04,
//   verdict: "ROBUST",
//   windowCount: 7,
//   seed: 42
// }
```

### Option C: I already have precomputed IS/OOS windows

```ts
import { analyzeFromWindows } from "@kiploks/engine-core";

const result = analyzeFromWindows({
  wfaInputMode: "precomputed",
  windows: [
    { optimizationReturn: 0.12, validationReturn: 0.08 },
    { optimizationReturn: 0.09, validationReturn: 0.06 },
    // ...
  ],
});

console.log(result.wfe.verdict); // "ROBUST" | "ACCEPTABLE" | "WEAK" | "FAIL"
```

### Option D: Monte Carlo on an equity curve

```ts
import { buildPathMonteCarloSimulation } from "@kiploks/engine-core";

const result = buildPathMonteCarloSimulation(
  equityPoints, // [{ value: number, timestamp?: number }, ...]
  { seed: 42, simulations: 10_000, horizonYears: 1 },
);

if (result) {
  console.log(result.cagrDistribution); // p5, p25, p50, p75, p95
  console.log(result.probabilityPositive);
  console.log(result.pathStability); // "HIGH" | "MEDIUM" | "LOW"
  console.log(result.tailRisk); // "HIGH" | "MEDIUM" | "LOW"
  console.log(result.interpretation); // plain-English bullet points
}
```

---

## Verdict reference

### WFA verdict (`wfe.verdict`)

Based on rank Walk-Forward Efficiency - how well in-sample performance transfers to out-of-sample.

| verdict       | rankWfe  | Meaning                                                    |
| ------------- | -------- | ---------------------------------------------------------- |
| `ROBUST`      | ≥ 1.15   | Strong rank transfer. Strategy behaves consistently.       |
| `ACCEPTABLE`  | 1.06-1.15 | Adequate. Monitor for alpha decay.                        |
| `WEAK`        | 1.00-1.06 | Low transfer. Significant OOS degradation.                |
| `FAIL`        | < 1.00   | No transfer, or IS positive / OOS negative. Do not deploy. |

### Final verdict (professional report)

| verdict         | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `ROBUST`        | Passes all validation gates. Review full report before deploying. |
| `CAUTION`       | Some gates failed or borderline. Fix flagged issues first.   |
| `DO NOT DEPLOY` | Critical failures detected. Do not deploy.                 |

### Institutional grade (professional WFA)

| grade                   | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| `AAA - INSTITUTIONAL GRADE` | All blocks strong. Suitable for institutional allocation. |
| `AA - PROFESSIONAL`     | Professional-level quality with monitoring.        |
| `A - ACCEPTABLE`        | Controlled allocation with periodic re-validation.   |
| `BBB - RESEARCH ONLY`   | Research only. Do not deploy to production.          |

---

## Bot integrations (Freqtrade, OctoBot)

This **engine** repo does **not** ship a Python package such as `kiploks_adapter`. Official **upload-to-Kiploks** flows live in separate repositories (Python-side clients; you do not need `@kiploks/engine-core` on the bot):

| Integration | Repository |
| ----------- | ---------- |
| Freqtrade   | [github.com/kiploks/kiploks-freqtrade](https://github.com/kiploks/kiploks-freqtrade) |
| OctoBot     | [github.com/kiploks/kiploks-octobot](https://github.com/kiploks/kiploks-octobot) |

Follow each repo's README for config and API keys. **Local** analysis with the Open Core stack: install `@kiploks/engine-core` (and optionally `@kiploks/engine-adapters` for CSV), or run `npx kiploks` from `@kiploks/engine-cli` on JSON you produce yourself.

Details: [`docs/BOT_INTEGRATIONS.md`](docs/BOT_INTEGRATIONS.md)

---

## Key design principles

**Deterministic.** Same input + same seed = bit-identical output every time, across machines and versions. Every result carries `inputHash`, `configHash`, and version fields so you can reproduce and audit any analysis.

**Versioned contracts.** `engineVersion`, `formulaVersion`, `contractVersion` travel with every output. When formulas change, versions bump explicitly - no silent breaks.

**No vendor lock-in.** Apache 2.0. Run fully local. The cloud platform at [kiploks.com](https://kiploks.com) uses the same engine and formulas.

**Zero magic.** Every metric is documented with its formula. Every verdict threshold is a named constant in the source. Nothing is a black box.

---

## Packages

| Package                     | Role                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@kiploks/engine-core`      | `analyze()`, `analyzeFromTrades()`, `analyzeFromWindows()`, `buildPathMonteCarloSimulation()`, `runProfessionalWfa()`                   |
| `@kiploks/engine-contracts` | Versioned TypeScript types and constants. Import these for type safety in your own code.                                                  |
| `@kiploks/engine-adapters`  | `csvToTrades` / streaming CSV to `Trade[]` (Freqtrade-shaped **JSON** is not parsed here; map to `Trade[]` in your layer).                |
| `@kiploks/engine-cli`       | `npx kiploks analyze` - run analysis from JSON file, upload to cloud, run conformance tests                                              |
| `@kiploks/engine-test-vectors` | Golden JSON fixtures for regression tests                                                                                             |

---

## Documentation

| Topic                                      | Link                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Which function to call** (start here)    | [`docs/ENTRYPOINTS.md`](docs/ENTRYPOINTS.md)                                            |
| WFA methodology                            | [`docs/WFA_PROFESSIONAL.md`](docs/WFA_PROFESSIONAL.md)                                  |
| Path Monte Carlo                           | [`docs/MONTE_CARLO_PATH.md`](docs/MONTE_CARLO_PATH.md)                                  |
| Freqtrade / OctoBot (separate Python repos) | [`docs/BOT_INTEGRATIONS.md`](docs/BOT_INTEGRATIONS.md)                                 |
| Reproducibility and hashes                 | [`docs/OPEN_CORE_REPRODUCIBILITY.md`](docs/OPEN_CORE_REPRODUCIBILITY.md)                  |
| Error catalog                              | [`docs/ERROR_CATALOG.md`](docs/ERROR_CATALOG.md)                                        |
| Local user guide                           | [`docs/OPEN_CORE_LOCAL_USER_GUIDE.md`](docs/OPEN_CORE_LOCAL_USER_GUIDE.md)               |
| Examples and output explorer               | [`docs/examples/result-layout-demo.html`](docs/examples/result-layout-demo.html)        |
| Research articles                          | [kiploks.com/research](https://kiploks.com/research)                                    |

---

## Quick checks (contributors)

```bash
npm install
npm run build
npm run engine:validate
```

---

## Status

Active development. Core formulas are tested and versioned. Surface APIs may change - follow [CHANGELOG.md](CHANGELOG.md) and pin versions across `@kiploks/engine-*` packages.

**What's implemented:**

- `analyze()` - basic trade summary and metadata
- `analyzeFromTrades()` - trade-sliced pseudo-WFA with rank WFE and permutation p-value
- `analyzeFromWindows()` - precomputed IS/OOS windows
- `buildPathMonteCarloSimulation()` - equity path bootstrap with CAGR/MDD distributions, pathStability, tailRisk, CVaR, Newey-West t-stat, autocorrelation detection
- `runProfessionalWfa()` - 7-block institutional report: equity curve analysis, advanced WFE, parameter stability, regime analysis, Monte Carlo validation, stress test, institutional grade

**Planned:** full path-level Monte Carlo for `monteCarloValidation` inside professional WFA (currently bootstrap over window scalars - see [`docs/WFA_PROFESSIONAL.md`](docs/WFA_PROFESSIONAL.md) section 5).

Feedback and PRs welcome.

---

## License

Apache License 2.0 - see [`LICENSE`](LICENSE).

**Kiploks** is a trademark of [kiploks.com](https://kiploks.com). The license covers this code; it does not grant use of the brand in ways that imply endorsement or confuse your fork with the official product. See [`TRADEMARK.md`](TRADEMARK.md).

---

If this engine is useful to you, a [GitHub star](https://github.com/kiploks/engine) helps others find it.
