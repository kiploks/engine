# @kiploks/engine-adapters

## New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and `top_n` modes.

![Kiploks UI preview](https://kiploks.com/video/kiploks-ui-sm.gif)

Demo video: [kiploks-ui.mp3](https://kiploks.com/video/kiploks-ui.mp3)

**Repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

CSV adapters for **[Kiploks](https://kiploks.com)** Open Core: map UTF-8 CSV (header row, comma or semicolon) into engine `Trade[]` via `csvToTrades` and `csvToTradesFromStream`.

**Keywords** CSV backtest import, streaming trades parse, algorithmic trading integration, TypeScript adapters.

Freqtrade- or OctoBot-shaped JSON is **not** parsed here; convert to `Trade[]` or CSV in your integration.

## Install

```bash
npm install @kiploks/engine-adapters @kiploks/engine-contracts
```

## Exports (overview)

- `csvToTrades(csvString, mapping)`
- `csvToTradesFromStream(stream, mapping, options)` - row cap for CLI-scale files

Use with `@kiploks/engine-core` for analysis. Product [kiploks.com](https://kiploks.com).

## License

Apache-2.0 (`LICENSE` in this package).

## Trademarks

See [TRADEMARK.md](https://github.com/kiploks/engine/blob/main/TRADEMARK.md) in the repository root.
