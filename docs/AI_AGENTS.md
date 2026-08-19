# AI agents and MCP

This guide explains how **other users** of the open-source Kiploks engine can let AI agents analyze backtests and fetch reports - without Kiploks cloud or private SaaS.

## What an agent can do

| Capability | Requires orchestrator? | MCP tool / CLI |
|------------|------------------------|----------------|
| WFA from trades CSV/JSON | No | `kiploks_analyze_trades` / `kiploks analyze-trades` |
| Full report from integration JSON | No | `kiploks_analyze_integration_payload` |
| List Freqtrade backtests on disk | Yes | `kiploks_list_backtests` |
| Run Freqtrade bridge + WFA | Yes | `kiploks_run_backtest_analysis` |
| Open report in local UI | Yes | `kiploks_get_report` -> `/ui/#report=<id>` |

## Quick start for users

### 1. Install engine CLI

```bash
npx -y @kiploks/engine-cli ui --no-open
```

Orchestrator listens on `http://127.0.0.1:41731` (or next free port). UI: `/ui/`.

### 2. Add MCP server to your agent

Package: `@kiploks/engine-mcp`

**Cursor** (`.cursor/mcp.json` or Settings -> MCP):

```json
{
  "mcpServers": {
    "kiploks": {
      "command": "npx",
      "args": ["-y", "@kiploks/engine-mcp"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): same block under `mcpServers`.

### 3. Analyze without Freqtrade (trades only)

No orchestrator needed. Agent tool:

- `kiploks_analyze_trades` with `input_path` pointing to CSV or JSON `Trade[]`

Or CLI:

```bash
kiploks analyze-trades ./trades.json --json \
  --in-sample-months 6 --out-of-sample-months 2 --step rolling
```

Sample output: `docs/examples/sample-output/wfa-from-trades.json`

### 4. Freqtrade end-to-end flow

Prerequisites on the user's machine:

- Freqtrade install (path known to the user)
- Docker (if using default `docker` integration mode)
- Orchestrator running (`kiploks ui --no-open`)

Agent steps:

1. `kiploks_orchestrator_status` - confirm orchestrator is up
2. `kiploks_register_freqtrade_path` - `path` = Freqtrade root
3. `kiploks_bootstrap_integration` - clones `kiploks-freqtrade` into that repo
4. `kiploks_list_backtests` - discover artifacts under `user_data/backtest_results`
5. `kiploks_run_backtest_analysis` - pass `selected_artifact_keys` from step 4
6. `kiploks_get_report` - full `TestResultData` JSON
7. Share UI link: `{orchestrator_url}/ui/#report={report_id}`

If integration upload needs Bearer auth, set in MCP env:

```json
"env": {
  "KIPLOKS_ORCHESTRATOR_TOKEN": "<api_token from kiploks.json after bootstrap>"
}
```

## Architecture

```mermaid
flowchart LR
  Agent[AI Agent]
  MCP[@kiploks/engine-mcp]
  Core[@kiploks/engine-core]
  Orch[kiploks ui orchestrator]
  Bridge[kiploks-freqtrade run.py]
  Agent --> MCP
  MCP -->|trades / payload files| Core
  MCP -->|HTTP| Orch
  Orch --> Bridge
  Bridge -->|POST /api/integration/results| Orch
  Orch -->|reports| MCP
```

- **Standalone analysis** uses `@kiploks/engine-core` directly inside the MCP process.
- **Freqtrade flow** uses the existing local orchestrator HTTP API (same as the web UI).
- **Cloud upload** is optional: users can still use `kiploks upload --cloud` with `KIPLOKS_API_KEY`; MCP does not require it.

## Programmatic API (no MCP)

For custom agents or scripts, use the same building blocks:

```ts
import { analyzeFromTrades } from "@kiploks/engine-core";
import { buildTestResultDataFromUnified } from "@kiploks/engine-core/server";
import { mapPayloadToUnified } from "@kiploks/engine-core";
```

See [ENTRYPOINTS.md](./ENTRYPOINTS.md) for choosing the right entrypoint.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP cannot connect to orchestrator | Start `kiploks ui --no-open`; check `KIPLOKS_ORCHESTRATOR_URL` |
| Empty backtest list | Register Freqtrade path; run a backtest; bootstrap bridge |
| `401` on integration POST | Set `KIPLOKS_ORCHESTRATOR_TOKEN` from `kiploks.json` |
| Docker upload `Connection refused` | From container use `host.docker.internal`, not `localhost` |
| `analyze_trades` rejects JSON | Input must be `Trade[]` array, not raw Freqtrade export |

## Related docs

- [packages/mcp-server/README.md](../packages/mcp-server/README.md) - MCP tool reference
- [BOT_INTEGRATIONS.md](./BOT_INTEGRATIONS.md) - Freqtrade/OctoBot bridges
- [LOCAL_ORCHESTRATOR_UI_ARCHITECTURE.md](./LOCAL_ORCHESTRATOR_UI_ARCHITECTURE.md) - HTTP routes
- [OPEN_CORE_LOCAL_USER_GUIDE.md](./OPEN_CORE_LOCAL_USER_GUIDE.md) - local user setup
