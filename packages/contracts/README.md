# @kiploks/engine-contracts

## New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and `top_n` modes.

https://github.com/user-attachments/assets/b376f964-ab70-44ef-b8f6-bc3fd19f4e21

**Repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

Versioned **TypeScript contracts** for **[Kiploks](https://kiploks.com)** Open Core: analyze I/O, test result shapes, engine and formula version constants. Use as the **stable boundary** between integrators, CLI, and `@kiploks/engine-core`.

**Keywords** trading API types, WFA contracts, analyze input schema, backtest result types, engine versioning.

## Install

```bash
npm install @kiploks/engine-contracts
```

## What is included

- `AnalyzeInput`, `AnalyzeConfig`, `AnalyzeOutput`
- `TestResultData` and related contract types
- Engine and formula version constants

Pair with `@kiploks/engine-core` for runtime behavior.

## License

Apache-2.0 (`LICENSE` in this package).

## Trademarks

See [TRADEMARK.md](https://github.com/kiploks/engine/blob/main/TRADEMARK.md) in the repository root.
