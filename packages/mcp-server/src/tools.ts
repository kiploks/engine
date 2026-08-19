import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const MCP_TOOLS: Tool[] = [
  {
    name: "kiploks_analyze_trades",
    description: "Run WFA on a local trades JSON or CSV file. No orchestrator required.",
    inputSchema: {
      type: "object",
      properties: {
        input_path: { type: "string", description: "Path to trades JSON array or CSV" },
        in_sample_months: { type: "number", description: "In-sample months (default 6)" },
        out_of_sample_months: { type: "number", description: "Out-of-sample months (default 2)" },
        step_mode: { type: "string", enum: ["rolling", "anchored"] },
        seed: { type: "number" },
        decimals: { type: "number" },
        permutation_n: { type: "number", description: "WFE permutation count (100..10000)" },
        initial_balance: { type: "number", description: "When trades only have profit_abs" },
      },
      required: ["input_path"],
    },
  },
  {
    name: "kiploks_analyze_integration_payload",
    description: "Build full TestResultData from an integration payload JSON file.",
    inputSchema: {
      type: "object",
      properties: {
        input_path: { type: "string", description: "Integration payload JSON path" },
      },
      required: ["input_path"],
    },
  },
  {
    name: "kiploks_orchestrator_status",
    description: "Check local orchestrator via GET /api-info.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kiploks_list_backtests",
    description: "List Freqtrade backtest artifacts from a running orchestrator.",
    inputSchema: {
      type: "object",
      properties: {
        integration: { type: "string", enum: ["freqtrade"] },
        bot_id: { type: "string" },
      },
    },
  },
  {
    name: "kiploks_list_reports",
    description: "List reports stored in the local orchestrator.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kiploks_get_report",
    description: "Fetch report JSON by id.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string" },
      },
      required: ["report_id"],
    },
  },
  {
    name: "kiploks_register_freqtrade_path",
    description: "Register a Freqtrade install path with the orchestrator.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to Freqtrade install root" },
      },
      required: ["path"],
    },
  },
  {
    name: "kiploks_bootstrap_integration",
    description: "Bootstrap kiploks-freqtrade or kiploks-octobot bridge.",
    inputSchema: {
      type: "object",
      properties: {
        integration: { type: "string", enum: ["freqtrade", "octobot"] },
      },
    },
  },
  {
    name: "kiploks_run_backtest_analysis",
    description: "Run integration for selected backtest artifacts and wait for completion.",
    inputSchema: {
      type: "object",
      properties: {
        selected_artifact_keys: { type: "array", items: { type: "string" } },
        integration: { type: "string", enum: ["freqtrade", "octobot"] },
        bot_id: { type: "string" },
        mode: { type: "string", enum: ["docker", "host", "wrapper"] },
        wait: { type: "boolean", description: "Wait for job (default true)" },
        timeout_ms: { type: "number", description: "Wait timeout ms (default 900000)" },
      },
      required: ["selected_artifact_keys"],
    },
  },
  {
    name: "kiploks_get_job",
    description: "Get integration job status by id.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        include_result: { type: "boolean" },
      },
      required: ["job_id"],
    },
  },
];
