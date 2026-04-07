# Kiploks Engine (Open Core)

[![npm](https://img.shields.io/npm/v/@kiploks/engine-core)](https://www.npmjs.com/package/@kiploks/engine-core)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Deterministic **walk-forward analysis** and backtest validation engine for algorithmic trading strategies - as **TypeScript npm packages** under **Apache 2.0**.

**Browse the full docs on the web:** **[kiploks.com/open-engine](https://kiploks.com/open-engine)** (same Markdown as in `docs/` below).

**New here?** Read **[`docs/ENTRYPOINTS.md`](docs/ENTRYPOINTS.md)** first — it maps **which function to call** (`analyze`, `analyzeFromTrades`, `analyzeFromWindows`, CSV adapters, `mapPayloadToUnified`) and what each expects.

**Main repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

Same formulas power [Kiploks](https://kiploks.com) in the cloud.

## Status

The engine is under active development. Core formulas are tested and versioned; surface APIs may change. Follow [CHANGELOG.md](CHANGELOG.md) and align versions across `@kiploks/engine-*` packages.

Feedback and PRs welcome.

## TODO

- **`monteCarloValidation` (Professional WFA):** Implemented today as **bootstrap over window-level OOS returns** (see [`docs/WFA_PROFESSIONAL.md`](docs/WFA_PROFESSIONAL.md) §5). **Planned:** extend to a **full** Monte Carlo validation design (scope and contract updates TBD).

## About Kiploks (kiploks.com)

[Kiploks](https://kiploks.com) is the product: a service for **serious strategy research** - institutional-style diagnostics, clear verdicts, and workflows built around **transparent, versioned methodology**. The hosted app adds collaboration, storage, integrations, and UI on top of the same analytical ideas you get in these packages.

## Philosophy

- **Open Core** - Public packages expose the **deterministic engine** and contracts so results stay explainable; integrators map their exports to `Trade[]` (convert bot exports to `Trade[]` or CSV in your own integration layer).
- **One source of math** - Where the product shows a metric, the goal is for the engine to encode the same definitions so **local runs and cloud runs stay comparable** (subject to API and version alignment).
- **Versioning** - Contracts carry **engine and formula versions** so upgrades are explicit, not silent.
- **Conformance** - Locked **test vectors** guard regressions when formulas or serialization change.

## Analyze quick start

```bash
mkdir /tmp/kiploks-engine-demo && cd /tmp/kiploks-engine-demo
npm init -y
npm install @kiploks/engine-core @kiploks/engine-contracts
node -e "const { analyze } = require('@kiploks/engine-core'); console.log(analyze({strategyId:'demo',trades:[{profit:2},{profit:-1}]},{seed:42,decimals:8}).summary)"
```

## WFA quick start

Trade-sliced **pseudo-WFA** (`tradeSlicedPseudoWfa`): slices trades into rolling windows, runs the public WFA pipeline, and returns `wfe` (rank WFE, permutation p-value, and related fields). Each trade needs `openTime` and `closeTime` in **Unix ms**. The series must span enough **calendar** time for the slicer to build **at least two** full IS+OOS windows (below: 3+1 months rolling, ~80 trades every five days).

```bash
node -e "
const { analyzeFromTrades } = require('@kiploks/engine-core');
const DAY = 86400000;
const base = Date.UTC(2019, 0, 1);
const trades = [];
for (let i = 0; i < 80; i++) {
  const d = i * 5;
  trades.push({ profit: 0.008, openTime: base + d * DAY, closeTime: base + (d + 1) * DAY });
}
const result = analyzeFromTrades(
  {
    trades,
    windowConfig: { inSampleMonths: 3, outOfSampleMonths: 1, stepMode: 'rolling' },
    wfaInputMode: 'tradeSlicedPseudoWfa',
  },
  { seed: 42, decimals: 8 },
);
console.log(result.wfe);
"
```

For precomputed windows (true walk-forward periods you already built), use `analyzeFromWindows()` from the same package.

For CLI commands (`analyze`, upload helpers, conformance), install `@kiploks/engine-cli` and run `npx kiploks --help`.

## Documentation

All Open Core guides and examples live in **[`docs/`](docs/README.md)** next to this file.

| Topic | Link |
| ----- | ---- |
| Documentation index | [`docs/README.md`](docs/README.md) |
| **Entrypoints map (input/output)** | [`docs/ENTRYPOINTS.md`](docs/ENTRYPOINTS.md) |
| Integration principles | [`docs/OPEN_CORE_INTEGRATION_PRINCIPLES.md`](docs/OPEN_CORE_INTEGRATION_PRINCIPLES.md) |
| Local user guide | [`docs/OPEN_CORE_LOCAL_USER_GUIDE.md`](docs/OPEN_CORE_LOCAL_USER_GUIDE.md) |
| WFA methodology | [`docs/WFA_PROFESSIONAL.md`](docs/WFA_PROFESSIONAL.md) |
| Reproducibility | [`docs/OPEN_CORE_REPRODUCIBILITY.md`](docs/OPEN_CORE_REPRODUCIBILITY.md) |
| Examples (how-tos, [`result-layout-demo.html`](docs/examples/result-layout-demo.html), sample JSON) | [`docs/examples/README.md`](docs/examples/README.md) |
| Error catalog | [`docs/ERROR_CATALOG.md`](docs/ERROR_CATALOG.md) |
| Freqtrade / OctoBot (Python, no npm engine required) | [`docs/BOT_INTEGRATIONS.md`](docs/BOT_INTEGRATIONS.md) |

## Packages

| Package | Role |
| -------- | ------ |
| `@kiploks/engine-contracts` | Versioned types and constants (`AnalyzeInput`, hashes policy, engine versions). |
| `@kiploks/engine-core` | `analyze()`, unified payload mapping, benchmark, turnover, WFA, and verdict-related logic for integrations and hosted workflows. |
| `@kiploks/engine-cli` | `kiploks` binary: analyze JSON, optional cloud upload, conformance test driver. |
| `@kiploks/engine-test-vectors` | JSON golden fixtures for regression tests (data-only package). |

## Quick checks

From **this folder** (engine repository root):

```bash
npm install
npm run build
npm run engine:validate
```

## Policy

- **Vectors and goldens** [`packages/test-vectors/CONFORMANCE.md`](packages/test-vectors/CONFORMANCE.md) (when to refresh hashes and expectations).
- **Contributing / security / code of conduct** [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) in this folder.

### Public API

The npm package **`@kiploks/engine-core`** publishes a single stable entrypoint (root import). Use that for integrators, scripts, and OSS workflows. Full report assembly on the hosted product uses additional wiring that is not exposed as a separate documented import for registry consumers.

## Trademarks and brand

**Kiploks** is a trademark of the product at [kiploks.com](https://kiploks.com). The Apache 2.0 license covers this code; it does not grant use of the brand in a way that implies endorsement or confuses your fork with the official product. See **[`TRADEMARK.md`](TRADEMARK.md)** for the full notice.

## License

Apache License 2.0 (see root [`LICENSE`](LICENSE)). Trademark usage: [`TRADEMARK.md`](TRADEMARK.md).
