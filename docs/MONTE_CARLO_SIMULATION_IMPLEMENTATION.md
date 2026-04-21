# Monte Carlo - engine scope (index)

Public Open Core documentation for Monte-related features in `@kiploks/engine-core` / `@kiploks/engine-contracts`.

| Document | Purpose |
|----------|---------|
| [**MONTE_CARLO_PATH.md**](./MONTE_CARLO_PATH.md) | **Path-based Monte Carlo** - `buildPathMonteCarloSimulation`: inputs, algorithm summary, limits, reproducibility, versioning (`PATH_MONTE_CARLO_METHOD_VERSION`). |
| [**WFA_PROFESSIONAL.md**](./WFA_PROFESSIONAL.md) §5 | **Professional `monteCarloValidation`** - bootstrap over per-window OOS returns (not path-level equity simulation). |

**Path MC** is a **separate API**; it is not embedded in `analyze()` / `analyzeFromTrades()` / `analyzeFromWindows()` JSON. Call `buildPathMonteCarloSimulation` when you have an equity curve.

**Window bootstrap** (`monteCarloValidation`) is computed inside the professional WFA pipeline when applicable. For precomputed WFA, `AnalyzeConfig.monteCarloBootstrapN` sets bootstrap iteration count (see contracts).

**Call-site options:** `runProfessionalWfa` / `buildProfessionalWfa` accept **`monteCarloMode`** (`legacy` \| `auto` \| `new_only`) and **`enablePathMc`** to control when path-based Monte Carlo is eligible versus per-window bootstrap (see [**WFA_PROFESSIONAL.md**](./WFA_PROFESSIONAL.md) §5 and the option types in `@kiploks/engine-contracts`). Host applications map their own configuration (env flags, feature toggles, remote config) to these fields; that wiring is not part of the published engine packages.

**Example:** [`examples/monte-carlo-example.md`](examples/monte-carlo-example.md). Golden regression fixture: [`examples/monte-carlo-seed42.json`](examples/monte-carlo-seed42.json).
