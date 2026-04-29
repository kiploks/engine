# @kiploks/engine-core

## New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and `top_n` modes.

https://github.com/user-attachments/assets/b376f964-ab70-44ef-b8f6-bc3fd19f4e21

**Repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

Deterministic **trading analytics engine** for **[Kiploks](https://kiploks.com)** Open Core: `analyze()`, walk-forward and professional-grade paths, benchmark and turnover logic, and types aligned with hosted Kiploks reports and integrations.

**Use cases** algorithmic trading research, **walk-forward analysis (WFA)**, backtest validation, risk and benchmark metrics in **TypeScript**, reproducible local pipelines.

## Install

```bash
npm install @kiploks/engine-core @kiploks/engine-contracts
```

## Quick example

```ts
import { analyze } from "@kiploks/engine-core";

const out = analyze(
  { strategyId: "demo", trades: [{ profit: 1.25 }, { profit: -0.4 }] },
  { seed: 42, decimals: 8 },
);

console.log(out.summary, out.metadata);
```

## Philosophy

Results are **deterministic** for a given input, config, and published version. The hosted product at [kiploks.com](https://kiploks.com) builds full reports and workflows on the same methodological stack; this package is the **embeddable core** for integrators and researchers.

## API policy

- **Browser / integrators:** `import { … } from "@kiploks/engine-core"` - stable, documented surface.
- **Node / hosted backends (full report assembly):** `import { … } from "@kiploks/engine-core/server"` - semver-stable **subpath** on npm. Do not use this from frontend bundles.
- The legacy `./internal` entry is stripped from published `package.json` (`prepack`); prefer `./server` for server-side code.

## License

Apache-2.0 (`LICENSE` in this package).

## Trademarks

The **Kiploks** name is a product trademark. Using this package does not grant rights to use the brand in a misleading way. See the repository root [`TRADEMARK.md`](https://github.com/kiploks/engine/blob/main/TRADEMARK.md).
