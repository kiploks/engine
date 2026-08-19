import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { analyzeIntegrationPayloadFile, analyzeTradesFile } from "./engineTools";
import {
  bootstrapIntegration,
  getApiInfo,
  getJob,
  getJobResult,
  getReport,
  listBacktests,
  listReports,
  registerFreqtradePath,
  resolveOrchestratorConfig,
  startIntegrationRun,
  waitForJob,
} from "./orchestratorClient";

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function readStringArg(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!required) return "";
  throw new Error(`Missing required argument: ${key}`);
}

function readNumberArg(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const TOOLS: Tool[] = [
  {
    name: "kiploks_analyze_trades",
    description:
      "Run walk-forward analysis on a local trades JSON or CSV file. No orchestrator required.",
    inputSchema: {
      type: "object",
      properties: {
        input_path: { type: "string", description: "Absolute or relative path to trades JSON array or CSV" },
        in_sample_months: { type: "number", description: "In-sample window length in months (default 6)" },
        out_of_sample_months: { type: "number", description: "Out-of-sample window length in months (default 2)" },
        step_mode: { type: "string", enum: ["rolling", "anchored"], description: "WFA step mode (default rolling)" },
        seed: { type: "number", description: "Optional reproducibility seed" },
        decimals: { type: "number", description: "Optional decimal precision" },
        permutation_n: { type: "number", description: "Optional WFE permutation count (100..10000)" },
        initial_balance: { type: "number", description: "Used when trades only have profit_abs" },
      },
      required: ["input_path"],
    },
  },
  {
    name: "kiploks_analyze_integration_payload",
    description:
      "Build a full Kiploks report (TestResultData) from an integration payload JSON file. No orchestrator required.",
    inputSchema: {
      type: "object",
      properties: {
        input_path: { type: "string", description: "Path to integration payload JSON (single result object)" },
      },
      required: ["input_path"],
    },
  },
  {
    name: "kiploks_orchestrator_status",
    description: "Check local Kiploks orchestrator availability via GET /api-info.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kiploks_list_backtests",
    description: "List Freqtrade backtest artifacts discovered by a running orchestrator.",
    inputSchema: {
      type: "object",
      properties: {
        integration: { type: "string", enum: ["freqtrade"], description: "Integration kind (default freqtrade)" },
        bot_id: { type: "string", description: "Optional bot id filter" },
      },
    },
  },
  {
    name: "kiploks_list_reports",
    description: "List analysis reports stored in the local orchestrator.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kiploks_get_report",
    description: "Fetch a full report JSON by report id from the local orchestrator.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "Report id from list_reports or integration run logs" },
      },
      required: ["report_id"],
    },
  },
  {
    name: "kiploks_register_freqtrade_path",
    description: "Register a Freqtrade install path with the local orchestrator.",
    inputSchema: {
      type: "object",
      properties: {
        canonical_path: { type: "string", description: "Absolute path to Freqtrade repo/install root" },
      },
      required: ["canonical_path"],
    },
  },
  {
    name: "kiploks_bootstrap_integration",
    description: "Bootstrap kiploks-freqtrade or kiploks-octobot bridge into a registered repo path.",
    inputSchema: {
      type: "object",
      properties: {
        integration: { type: "string", enum: ["freqtrade", "octobot"], description: "Default freqtrade" },
      },
    },
  },
  {
    name: "kiploks_run_backtest_analysis",
    description:
      "Start an integration run for selected backtest artifacts, wait for completion, return job + result summary.",
    inputSchema: {
      type: "object",
      properties: {
        selected_artifact_keys: {
          type: "array",
          items: { type: "string" },
          description: "Artifact keys from kiploks_list_backtests",
        },
        integration: { type: "string", enum: ["freqtrade", "octobot"], description: "Default freqtrade" },
        bot_id: { type: "string", description: "Optional bot id" },
        mode: { type: "string", enum: ["docker", "host", "wrapper"], description: "Runner mode (default docker)" },
        wait: { type: "boolean", description: "Wait for job completion (default true)" },
        timeout_ms: { type: "number", description: "Wait timeout in ms (default 900000)" },
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
        include_result: { type: "boolean", description: "Also fetch /jobs/:id/result (default false)" },
      },
      required: ["job_id"],
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>) {
  const orch = resolveOrchestratorConfig();

  switch (name) {
    case "kiploks_analyze_trades":
      return textResult(
        await analyzeTradesFile({
          inputPath: readStringArg(args, "input_path"),
          inSampleMonths: readNumberArg(args, "in_sample_months"),
          outOfSampleMonths: readNumberArg(args, "out_of_sample_months"),
          stepMode: (args.step_mode as "rolling" | "anchored" | undefined) ?? "rolling",
          seed: readNumberArg(args, "seed"),
          decimals: readNumberArg(args, "decimals"),
          permutationN: readNumberArg(args, "permutation_n"),
          initialBalance: readNumberArg(args, "initial_balance"),
        }),
      );

    case "kiploks_analyze_integration_payload":
      return textResult(await analyzeIntegrationPayloadFile(readStringArg(args, "input_path")));

    case "kiploks_orchestrator_status":
      return textResult(await getApiInfo(orch));

    case "kiploks_list_backtests":
      return textResult(
        await listBacktests(
          orch,
          (args.integration as "freqtrade" | undefined) ?? "freqtrade",
          readStringArg(args, "bot_id", false) || undefined,
        ),
      );

    case "kiploks_list_reports":
      return textResult(await listReports(orch));

    case "kiploks_get_report":
      return textResult(await getReport(orch, readStringArg(args, "report_id")));

    case "kiploks_register_freqtrade_path":
      return textResult(await registerFreqtradePath(orch, readStringArg(args, "canonical_path")));

    case "kiploks_bootstrap_integration":
      return textResult(
        await bootstrapIntegration(orch, (args.integration as "freqtrade" | "octobot" | undefined) ?? "freqtrade"),
      );

    case "kiploks_run_backtest_analysis": {
      const keysRaw = args.selected_artifact_keys;
      if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
        throw new Error("selected_artifact_keys must be a non-empty string array");
      }
      const selectedArtifactKeys = keysRaw.map((k) => String(k));
      const wait = args.wait !== false;
      const { jobId, raw: started } = await startIntegrationRun(orch, {
        integration: (args.integration as "freqtrade" | "octobot" | undefined) ?? "freqtrade",
        selectedArtifactKeys,
        botId: readStringArg(args, "bot_id", false) || undefined,
        mode: (args.mode as "docker" | "host" | "wrapper" | undefined) ?? "docker",
      });
      if (!wait) return textResult({ started, jobId });
      const finished = await waitForJob(orch, jobId, { timeoutMs: readNumberArg(args, "timeout_ms") ?? 900000 });
      const result = await getJobResult(orch, jobId);
      return textResult({ jobId, job: finished, result });
    }

    case "kiploks_get_job": {
      const jobId = readStringArg(args, "job_id");
      const job = await getJob(orch, jobId);
      if (args.include_result === true) {
        const result = await getJobResult(orch, jobId);
        return textResult({ job, result });
      }
      return textResult(job);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: "kiploks-engine", version: "0.4.3" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      return await handleToolCall(request.params.name, args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  runMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kiploks-mcp failed: ${message}\n`);
    process.exit(1);
  });
}
