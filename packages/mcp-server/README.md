# @kiploks/engine-mcp

MCP server for the [Kiploks open-source engine](https://github.com/kiploks/engine).

## Install

```bash
npx -y @kiploks/engine-mcp
```

From checkout:

```bash
npm install
npm run build -w @kiploks/engine-mcp
node packages/mcp-server/dist/index.js
```

## MCP config

```json
{
  "mcpServers": {
    "kiploks": {
      "command": "npx",
      "args": ["-y", "@kiploks/engine-mcp"],
      "env": {
        "KIPLOKS_ORCHESTRATOR_URL": "http://127.0.0.1:41731",
        "KIPLOKS_ORCHESTRATOR_TOKEN": "optional-from-kiploks.json"
      }
    }
  }
}
```

## Tools

| Tool | Needs orchestrator? |
| --- | --- |
| `kiploks_analyze_trades` | No |
| `kiploks_analyze_integration_payload` | No |
| `kiploks_orchestrator_status` | Yes |
| `kiploks_list_backtests` | Yes |
| `kiploks_list_reports` | Yes |
| `kiploks_get_report` | Yes |
| `kiploks_register_freqtrade_path` | Yes |
| `kiploks_bootstrap_integration` | Yes |
| `kiploks_run_backtest_analysis` | Yes |
| `kiploks_get_job` | Yes |

Start orchestrator: `npx -y @kiploks/engine-cli ui --no-open`

See [docs/AI_AGENTS.md](../../docs/AI_AGENTS.md) for workflows.
