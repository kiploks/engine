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

function readString(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!required) return "";
  throw new Error(`Missing required argument: ${key}`);
}

function readNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function handleToolCall(name: string, args: Record<string, unknown>) {
  const orch = resolveOrchestratorConfig();

  switch (name) {
    case "kiploks_analyze_trades":
      return textResult(
        await analyzeTradesFile({
          inputPath: readString(args, "input_path"),
          inSampleMonths: readNumber(args, "in_sample_months"),
          outOfSampleMonths: readNumber(args, "out_of_sample_months"),
          stepMode: (args.step_mode as "rolling" | "anchored" | undefined) ?? "rolling",
          seed: readNumber(args, "seed"),
          decimals: readNumber(args, "decimals"),
          permutationN: readNumber(args, "permutation_n"),
          initialBalance: readNumber(args, "initial_balance"),
        }),
      );

    case "kiploks_analyze_integration_payload":
      return textResult(await analyzeIntegrationPayloadFile(readString(args, "input_path")));

    case "kiploks_orchestrator_status":
      return textResult(await getApiInfo(orch));

    case "kiploks_list_backtests":
      return textResult(
        await listBacktests(
          orch,
          (args.integration as "freqtrade" | undefined) ?? "freqtrade",
          readString(args, "bot_id", false) || undefined,
        ),
      );

    case "kiploks_list_reports":
      return textResult(await listReports(orch));

    case "kiploks_get_report":
      return textResult(await getReport(orch, readString(args, "report_id")));

    case "kiploks_register_freqtrade_path":
      return textResult(await registerFreqtradePath(orch, readString(args, "path")));

    case "kiploks_bootstrap_integration":
      return textResult(
        await bootstrapIntegration(orch, (args.integration as "freqtrade" | "octobot" | undefined) ?? "freqtrade"),
      );

    case "kiploks_run_backtest_analysis": {
      const keys = args.selected_artifact_keys;
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error("selected_artifact_keys must be a non-empty string array");
      }
      const wait = args.wait !== false;
      const { jobId, raw: started } = await startIntegrationRun(orch, {
        integration: (args.integration as "freqtrade" | "octobot" | undefined) ?? "freqtrade",
        selectedArtifactKeys: keys.map(String),
        botId: readString(args, "bot_id", false) || undefined,
        mode: (args.mode as "docker" | "host" | "wrapper" | undefined) ?? "docker",
      });
      if (!wait) return textResult({ started, jobId });
      const job = await waitForJob(orch, jobId, { timeoutMs: readNumber(args, "timeout_ms") ?? 900_000 });
      const result = await getJobResult(orch, jobId);
      return textResult({ jobId, job, result });
    }

    case "kiploks_get_job": {
      const jobId = readString(args, "job_id");
      const job = await getJob(orch, jobId);
      if (args.include_result === true) {
        return textResult({ job, result: await getJobResult(orch, jobId) });
      }
      return textResult(job);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
