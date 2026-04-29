# @kiploks/engine-test-vectors

## New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and `top_n` modes.

https://github.com/user-attachments/assets/b376f964-ab70-44ef-b8f6-bc3fd19f4e21

**Repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

Golden **JSON fixtures** for **[Kiploks](https://kiploks.com)** Open Core: **conformance** and **regression** tests for `analyze()` and core pure functions (risk, benchmark, turnover). Consumers of `@kiploks/engine-core` normally do not need this package unless you replicate our test suite.

**Keywords** trading engine golden tests, backtest fixture data, deterministic regression vectors, WFA test data.

## Install

```bash
npm install @kiploks/engine-test-vectors
```

## Package contents

- `v1/*` - Analyze pipeline vectors with locked input/config hashes
- `v2/*` - Extended goldens (risk, benchmark, turnover blocks)
- `CONFORMANCE.md` - Policy and when to refresh metadata

## License

Apache-2.0 (`LICENSE` in this package).

## Trademarks

See [TRADEMARK.md](https://github.com/kiploks/engine/blob/main/TRADEMARK.md) in the repository root.
