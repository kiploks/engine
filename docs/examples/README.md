# Open Core examples

Short, copy-paste friendly examples for `@kiploks/engine-*` packages. All examples use **English** comments only.

## Markdown how-tos

| # | File | Topic |
| --- | ---- | ----- |
| 01 | [`01-minimal-analyze.md`](01-minimal-analyze.md) | Minimal `analyze()` (TypeScript + optional CLI) |
| 02 | [`02-wfa-from-trades.md`](02-wfa-from-trades.md) | `analyzeFromTrades()` (trade-sliced pseudo-WFA) |
| 03 | [`03-wfa-from-windows.md`](03-wfa-from-windows.md) | `analyzeFromWindows()` (precomputed windows) |
| 04 | [`04-csv-to-trades.md`](04-csv-to-trades.md) | CSV → `Trade[]` (integration mapping or CLI) |
| 05 | [`05-cli-validate-and-analyze-trades.md`](05-cli-validate-and-analyze-trades.md) | `kiploks validate` + `analyze-trades` |
| 06 | [`06-cloud-upload-parity.md`](06-cloud-upload-parity.md) | `kiploks upload --cloud` with `--local-analyze` |
| 07 | [`07-metadata-and-reproducibility.md`](07-metadata-and-reproducibility.md) | Reading `metadata` hashes from `analyze()` |
| 08 | [`08-result-shape-and-kiploks-ui.md`](08-result-shape-and-kiploks-ui.md) | How JSON maps to product analysis blocks + [`result-layout-demo.html`](result-layout-demo.html) |
| 09 | [`09-full-report-vs-public-wfa.md`](09-full-report-vs-public-wfa.md) | Benchmark, risk, kill switch and full `TestResultData` vs public WFA output |
| 10 | [`10-methodology-flow-and-engine.md`](10-methodology-flow-and-engine.md) | Methodology page block order (DQG → … → Final Verdict) mapped to `core/` (package `@kiploks/engine-core`) and OSS examples |
| 11 | [`monte-carlo-example.md`](monte-carlo-example.md) | `buildPathMonteCarloSimulation` - toy curve, seed, reading labels |

## Static assets (same folder)

| Item | Description |
| ---- | ----------- |
| [`result-layout-demo.html`](result-layout-demo.html) | Open in a browser (developer setup, npm, CLI, doc links), `analyze` / `analyzeFromTrades` / `analyzeFromWindows` samples, **Monte Carlo** tab (path MC + professional `monteCarloValidation`), verdicts, and contract tables |
| [`sample-output/`](sample-output/) | Example `analyze()` / `analyzeFromTrades()` JSON; regenerate with `npm run engine:examples:generate-samples` from the engine repo root |
| [`monte-carlo-seed42.json`](monte-carlo-seed42.json) | Golden input/expected subset for path MC §8.6; regenerate with `npm run engine:examples:generate-monte-carlo-fixture` (after `npm run build`) |
| [`scripts/generate-samples.mjs`](scripts/generate-samples.mjs) | Writes files under `sample-output/` |
| [`scripts/generate-monte-carlo-seed42.mjs`](scripts/generate-monte-carlo-seed42.mjs) | Writes `monte-carlo-seed42.json` |

Trading-bot-specific JSON shapes are **not** parsed in-tree; convert exports to `Trade[]` or CSV in your integration.

Start with **01**, then **02** or **03** for WFA. Use **04** for CSV ingestion. **05**–**07** cover CLI and API workflows. For UI mapping and samples, see **08** and [`result-layout-demo.html`](result-layout-demo.html) (other static assets in the table above). For benchmark / risk / kill switch vs OSS WFA, see **09**. For the **same methodology block order** as the product page and where it lives in code, see **10** (there is no separate runnable example per block; full report needs the product pipeline).
