# @kiploks/engine-cli

## ✨ New: easier Freqtrade bot testing in UI

You can now run Freqtrade bot tests directly from the web interface with much less setup friction.

https://github.com/user-attachments/assets/b376f964-ab70-44ef-b8f6-bc3fd19f4e21

Run the UI with one of these options:

```bash
# from engine repo root:
npm install
npm run ui

# or without global install:
npx -y @kiploks/engine-cli ui --watch

```

- Pick a specific backtest artifact from the list, or run in `Auto (top_n)` mode.
- Start integration runs from a cleaner Step 4 workspace with collapsible sections.
- Get report links in run logs after successful local runs, so you can open results right away.
- Report title handling is automatic and predictable when switching between artifact and [top_n](https://github.com/kiploks/kiploks-freqtrade#configuration-details-kiploksjson) modes.

**Repository:** [github.com/kiploks/engine](https://github.com/kiploks/engine)

Command-line entry for the **[Kiploks](https://kiploks.com)** Open Core engine: run `analyze` on JSON, optional **cloud upload** for parity checks, and drive the full **engine validation** suite from a git checkout of this repository.

**Keywords** trading CLI, backtest JSON analyze, integration API upload, walk-forward engine tests, npm binary `kiploks`.

## Commands

### `kiploks test-conformance`

Runs the full engine validation pipeline when invoked from a **repository checkout** that contains the engine workspace (resolves config via `vitest.config.ts` and `engine:validate`):

- Vitest suite for the engine workspace
- Engine boundary import check
- Open Core npm bundle safety check

Equivalent to `npm run engine:validate` at the **engine** repository root.

```bash
npm run engine:test-conformance
# or, from repo root with the CLI on PATH:
kiploks test-conformance
```

### `kiploks analyze`

Run the deterministic `analyze()` pipeline on a JSON file matching `AnalyzeInput`.

```bash
kiploks analyze ./input.json --json
```

### `kiploks ui`

Start local OSS orchestrator server for UI shell workflows (CSV analysis, preflight, local paths, jobs).

```bash
kiploks ui --port 41731
# without auto-opening browser:
kiploks ui --no-open
```

Default behavior:
- binds to `127.0.0.1`;
- retries with fallback ports when preferred port is occupied;
- prints available local API routes at `/`;
- demo SaaS-shaped reports load only when **`KIPLOKS_UI_SEED_SAAS_DEMOS=1`** is set (fixtures `saas-mock-report.json` / `saas-mock-paper-tiger-report.json`).

### `kiploks upload --cloud`

POST integration result payload(s) to the Kiploks API (`POST /api/integration/results`), the same path used by external integration scripts toward **[Kiploks](https://kiploks.com)**.

**Environment**

- `KIPLOKS_API_BASE` - API origin (no trailing slash), e.g. `https://kiploks.com` for production, or `http://127.0.0.1:3001` for a local API.
- `KIPLOKS_API_KEY` - Bearer token (Integration API key from the product).

**Options**

- `--dry-run` - Print what would be sent without POST.
- `--local-analyze <file>` - Attach `kiploksLocalEngine.metadata` from a prior `kiploks analyze --json` output so the server can report **engine parity** (local vs server `analyze()` on `oos_trades`).
- `--skip-status` - Skip GET `/api/integration/analyze-status` preflight (quota and storage hints).

**Example**

```bash
export KIPLOKS_API_BASE=https://kiploks.com
export KIPLOKS_API_KEY=your_key
kiploks analyze ./minimal-input.json --json > local-analyze.json
kiploks upload ./standalone-result.json --cloud --local-analyze ./local-analyze.json
```

The upload response includes `parity` (per result) and `funnel` (free tier, monthly remaining, `upgradeUrl`).

## License

Apache-2.0 - see repository `LICENSE`.

## Trademarks

See [TRADEMARK.md](https://github.com/kiploks/engine/blob/main/TRADEMARK.md) in the repository root.
