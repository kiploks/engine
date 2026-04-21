# Changelog

All notable changes to the Kiploks engine packages will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(nothing yet)

## [0.2.0] - 2026-04-12

### Added

- `buildPathMonteCarloSimulation` in `@kiploks/engine-core`: path-based i.i.d. bootstrap over equity period returns; CAGR and max drawdown distributions, labels, `interpretation`, `meta` (`PATH_MONTE_CARLO_METHOD_VERSION`, currently **1.1.0**).
- `calculateCagrFromYears` in `financialMath.ts`.
- Contract types in `@kiploks/engine-contracts`: `PathMonteCarloResult`, `PathMonteCarloOptions`, `PathMonteCarloEquityPoint`, `DistributionStats` (incl. optional `varCornishFisher95`), extended `PathMonteCarloMeta`.
- `packages/core/src/prng.ts` - shared `createMulberry32` (path MC, professional window bootstrap, WFE).
- `AnalyzeConfig.monteCarloBootstrapN` for precomputed `analyzeFromWindows` (professional `monteCarloValidation` iterations; default 1000, clamp 100-50000).
- Docs: `MONTE_CARLO_PATH.md`, `MONTE_CARLO_SIMULATION_IMPLEMENTATION.md`, `examples/monte-carlo-example.md`, golden `examples/monte-carlo-seed42.json`, `npm run engine:examples:generate-monte-carlo-fixture`. Demo tab in `examples/result-layout-demo.html`.

### Changed

- **Path Monte Carlo (method 1.1.0):** CAGR via `calculateCagrFromYears`; inline max drawdown on `Float64Array`; CVaR aligned with Type-7 VaR tail; autocorrelation warning and optional `periodReturnsAutocorrelationLag1` / `periodReturnsNeweyWestTStat` in `meta`.
- **Professional `monteCarloValidation`:** CIs use `percentileType7`; always Mulberry32 with `PATH_MONTE_CARLO_DEFAULT_SEED` when seed missing; configurable bootstrap count; verdict thresholds 0.75 / 0.6 / 0.5 without `actualMeanReturn` gating (`WFA_PROFESSIONAL.md` §5).

### Removed (docs)

- Internal planning files `MONTE_CARLO_PATH_INSTITUTIONAL_PLAN.md` and `MONTE_CARLO_PATH_PROGRESS.md` from the public engine tree; user-facing Monte docs are `MONTE_CARLO_PATH.md` and the short index only.

## [0.1.0] - 2026-04-03

- Initial release.
