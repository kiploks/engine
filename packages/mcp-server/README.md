# @kiploks/engine-mcp

MCP server for the [Kiploks open-source engine](https://github.com/kiploks/engine). Lets AI agents (Cursor, Claude Desktop, etc.) run walk-forward analysis, list Freqtrade backtests, trigger integration runs, and fetch reports.

## Install

From a checkout:

```bash
cd engine
npm install
npm run build -w @kiploks/engine-mcp
```

Or after publish:

```bash
npx -y @kiploks/engine-mcp
```

## Cursor / Claude Desktop config

Add to your MCP settings (stdio):

```json
{
  "mcpServers": {
    "kiploks": {
      "command": "npx",
      "args": ["-y", "@kiploks/engine-mcp"],
      "env": {
        "KIPLOKS_ORCHESTRATOR_URL": "http://127.0.0.1:41731",
        "KIPLOKS_ORCHESTRATOR_TOKEN": "optional-bearer-token-from-kiploks-json"
      }
    }
  }
}
```

For local development from this repo:

```json
{
  "mcpServers": {
    "kiploks": {
      "command": "node",
      "args": ["/absolute/path/to/engine/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Prerequisites

| Flow | What you need |
|------|----------------|
| Analyze trades file | `@kiploks/engine-core` only - no orchestrator |
| Full report from integration JSON | Same - uses `buildTestResultDataFromUnified` |
| Freqtrade backtest list / run | `kiploks ui --no-open` orchestrator running |
| Freqtrade bridge | Registered Freqtrade path + bootstrap (see docs/AI_AGENTS.md) |

Start orchestrator:

```bash
npx -y @kiploks/engine-cli ui --no-open
```

## Tools

| Tool | Description |
|------|-------------|
| `kiploks_analyze_trades` | WFA from local trades JSON/CSV |
| `kiploks_analyze_integration_payload` | Full report from integration payload JSON |
| `kiploks_orchestrator_status` | GET /api-info |
| `kiploks_list_backtests` | List Freqtrade artifacts |
| `kiploks_list_reports` | List stored reports |
| `kiploks_get_report` | Fetch report by id |
| `kiploks_register_freqtrade_path` | Register Freqtrade install path |
| `kiploks_bootstrap_integration` | Install kiploks-freqtrade bridge |
| `kiploks_run_backtest_analysis` | Run integration + wait for result |
| `kiploks_get_job` | Poll job status |

## Environment

- `KIPLOKS_ORCHESTRATOR_URL` - default `http://127.0.0.1:41731`
- `KIPLOKS_ORCHESTRATOR_TOKEN` - Bearer token for protected integration routes (from `kiploks.json` `api_token` after bootstrap)

## Example agent flow (Freqtrade)

1. User starts orchestrator: `kiploks ui --no-open`
2. Agent calls `kiploks_orchestrator_status`
3. Agent calls `kiploks_register_freqtrade_path` with user's Freqtrade path
4. Agent calls `kiploks_bootstrap_integration`
5. Agent calls `kiploks_list_backtests`
6. Agent calls `kiploks_run_backtest_analysis` with `selected_artifact_keys`
7. Agent calls `kiploks_get_report` with report id from result

See [docs/AI_AGENTS.md](../../docs/AI_AGENTS.md) for full setup.
