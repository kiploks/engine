import { buildConfig, readInputJson, runAnalyze } from "./commands/analyze";
import { runTestConformance } from "./commands/test-conformance";
import { runUpload } from "./commands/upload";
import { runAnalyzeTrades } from "./commands/analyze-trades";
import { runAnalyzeWindows } from "./commands/analyze-windows";
import { runValidate } from "./commands/validate";
import { parsePermutationNCli } from "./parsePermutationN";
import { runUiServer } from "./commands/ui";

function printHelp(): void {
  process.stdout.write(
    [
      "Usage:",
      "  kiploks analyze <input.json> [--json] [--seed 42] [--decimals 8]",
      "  kiploks analyze-trades <input> [--json] --in-sample-months N --out-of-sample-months M --step rolling|anchored",
      "    [--format auto|raw|csv] [--show-detected-format]",
      "    [--map-profit <col>] [--map-open-time <col>] [--map-close-time <col>]",
      "    [--map-direction <col>] [--map-symbol <col>]",
      "    [--permutation-n 100..10000]",
      "  kiploks validate <input.json> --schema trade-based-wfa [--json] [--explain]",
      "  kiploks analyze-windows <windows.json> [--json] [--seed 42] [--decimals 8] [--permutation-n 100..10000]",
      "  kiploks upload <payload.json> --cloud [options]",
      "  kiploks test-conformance",
      "  kiploks ui [--port 41731] [--no-open] [--watch]",
      "",
      "Upload options:",
      "  --cloud              Required for upload (integration results JSON)",
      "  --dry-run            Print plan without POST",
      "  --json               Machine-readable output",
      "  --local-analyze <f>  Merge engine analyze output JSON for parity (first result)",
      "  --api-base-url <url> Override KIPLOKS_API_BASE (default http://127.0.0.1:3001)",
      "  --skip-status        Skip GET /api/integration/analyze-status preflight",
      "",
      "Environment:",
      "  KIPLOKS_API_BASE     API origin without path, e.g. https://kiploks.com",
      "  KIPLOKS_API_KEY      Bearer token for integration API",
      "",
      "Examples:",
      "  kiploks analyze ./input.json --json",
      "  kiploks analyze-trades trades.json --json --in-sample-months 3 --out-of-sample-months 1 --step rolling --format raw",
      "  KIPLOKS_API_KEY=... kiploks upload ./result.json --cloud",
      "  kiploks test-conformance",
      "  kiploks ui --port 41731",
      "  kiploks ui --watch   # Vite dev server + HMR (API proxied to orchestrator)",
      "",
      "test-conformance:",
      "  Runs engine validation (Vitest + boundary + bundle checks) when executed from",
      "  a checkout whose root package.json defines engine:validate. Same as: npm run engine:validate",
      "",
    ].join("\n"),
  );
}

function parseAnalyzeArgs(argv: string[]): { ok: true; args: Parameters<typeof runAnalyze>[0] } | { ok: false } {
  const inputPath = argv[0];
  if (!inputPath) return { ok: false };
  let json = false;
  let seed: number | undefined;
  let decimals: number | undefined;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    if (arg === "--seed") seed = Number(argv[i + 1]);
    if (arg === "--decimals") decimals = Number(argv[i + 1]);
  }
  return { ok: true, args: { inputPath, json, seed, decimals } };
}

function parseAnalyzeTradesArgs(
  argv: string[],
): { ok: true; args: Parameters<typeof runAnalyzeTrades>[0] } | { ok: false } {
  const inputPath = argv[0];
  if (!inputPath) return { ok: false };

  let json = false;
  let seed: number | undefined;
  let decimals: number | undefined;
  let permutationN: number | undefined;

  let inSampleMonths = 6;
  let outOfSampleMonths = 2;
  let stepMode: "anchored" | "rolling" = "rolling";

  let format: "auto" | "raw-trades" | "csv" = "auto";
  let showDetectedFormat = false;
  let initialBalance: number | undefined;

  let mapProfit = "profit";
  let mapOpenTime = "openTime";
  let mapCloseTime = "closeTime";
  let mapDirection: string | undefined;
  let mapSymbol: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") json = true;
    if (arg === "--seed") seed = Number(argv[i + 1]);
    if (arg === "--decimals") decimals = Number(argv[i + 1]);
    if (arg === "--permutation-n") permutationN = parsePermutationNCli(argv[i + 1]);
    if (arg === "--in-sample-months") inSampleMonths = Number(argv[i + 1]);
    if (arg === "--out-of-sample-months") outOfSampleMonths = Number(argv[i + 1]);
    if (arg === "--step") {
      const v = (argv[i + 1] ?? "").toString();
      if (v === "anchored" || v === "rolling") stepMode = v;
    }
    if (arg === "--format") {
      const v = (argv[i + 1] ?? "").toString();
      if (v === "auto" || v === "raw" || v === "csv") {
        format = v === "raw" ? "raw-trades" : (v as typeof format);
      }
    }
    if (arg === "--show-detected-format") showDetectedFormat = true;
    if (arg === "--initial-balance") initialBalance = Number(argv[i + 1]);

    if (arg === "--map-profit") mapProfit = (argv[i + 1] ?? mapProfit).toString();
    if (arg === "--map-open-time") mapOpenTime = (argv[i + 1] ?? mapOpenTime).toString();
    if (arg === "--map-close-time") mapCloseTime = (argv[i + 1] ?? mapCloseTime).toString();
    if (arg === "--map-direction") mapDirection = argv[i + 1]?.toString();
    if (arg === "--map-symbol") mapSymbol = argv[i + 1]?.toString();
  }

  if (!Number.isFinite(inSampleMonths) || inSampleMonths <= 0) return { ok: false };
  if (!Number.isFinite(outOfSampleMonths) || outOfSampleMonths <= 0) return { ok: false };

  return {
    ok: true,
    args: {
      inputPath,
      json,
      seed,
      decimals,
      inSampleMonths,
      outOfSampleMonths,
      stepMode,
      format,
      showDetectedFormat,
      initialBalance,
      csvMapping: {
        mapProfit,
        mapOpenTime,
        mapCloseTime,
        mapDirection,
        mapSymbol,
      },
      permutationN,
    },
  };
}

function parseUploadArgs(
  argv: string[],
): { ok: true; args: import("./commands/upload").UploadCliArgs } | { ok: false } {
  if (!argv.includes("--cloud")) {
    process.stderr.write("upload requires --cloud\n");
    return { ok: false };
  }
  let filePath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--local-analyze" || a === "--api-base-url") {
      i += 1;
      continue;
    }
    if (!a.startsWith("--")) {
      filePath = a;
      break;
    }
  }
  if (!filePath) {
    process.stderr.write("upload requires <payload.json>\n");
    return { ok: false };
  }
  let dryRun = false;
  let json = false;
  let localAnalyzePath: string | undefined;
  let skipStatus = false;
  let apiBaseUrl = process.env.KIPLOKS_API_BASE?.trim() || "http://127.0.0.1:3001";
  const apiKey = process.env.KIPLOKS_API_KEY?.trim() || "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--json") json = true;
    if (arg === "--skip-status") skipStatus = true;
    if (arg === "--local-analyze") localAnalyzePath = argv[i + 1];
    if (arg === "--api-base-url") apiBaseUrl = argv[i + 1] ?? apiBaseUrl;
  }
  if (!dryRun && !apiKey) {
    process.stderr.write("KIPLOKS_API_KEY is required for upload (or use --dry-run).\n");
    return { ok: false };
  }
  return {
    ok: true,
    args: {
      filePath,
      dryRun,
      json,
      localAnalyzePath,
      apiBaseUrl,
      apiKey,
      skipStatus,
    },
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv.shift();

  if (command === "analyze") {
    const parsed = parseAnalyzeArgs(argv);
    if (!parsed.ok) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await runAnalyze(parsed.args);
    return;
  }

  if (command === "analyze-trades") {
    const parsed = parseAnalyzeTradesArgs(argv);
    if (!parsed.ok) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await runAnalyzeTrades(parsed.args);
    return;
  }

  if (command === "validate") {
    const inputPath = argv[0];
    if (!inputPath) {
      printHelp();
      process.exitCode = 1;
      return;
    }

    let schema: "trade-based-wfa" | undefined;
    let explain = false;
    let json = false;

    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "--schema") schema = (argv[i + 1] ?? "") as any;
      if (arg === "--explain") explain = true;
      if (arg === "--json") json = true;
    }

    if (!schema || schema !== "trade-based-wfa") {
      printHelp();
      process.exitCode = 1;
      return;
    }

    await runValidate({ inputPath, schema, explain, json });
    return;
  }

  if (command === "analyze-windows") {
    // Reuse the minimal shared flag parsing (json + seed + decimals).
    const inputPath = argv[0];
    if (!inputPath) {
      printHelp();
      process.exitCode = 1;
      return;
    }

    let json = false;
    let seed: number | undefined;
    let decimals: number | undefined;
    let permutationN: number | undefined;
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "--json") json = true;
      if (arg === "--seed") seed = Number(argv[i + 1]);
      if (arg === "--decimals") decimals = Number(argv[i + 1]);
      if (arg === "--permutation-n") permutationN = parsePermutationNCli(argv[i + 1]);
    }

    await runAnalyzeWindows({ inputPath, json, seed, decimals, permutationN });
    return;
  }

  if (command === "upload") {
    const parsed = parseUploadArgs(argv);
    if (!parsed.ok) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await runUpload(parsed.args);
    return;
  }

  if (command === "test-conformance") {
    if (argv.length > 0) {
      process.stderr.write("test-conformance takes no arguments\n");
      process.exitCode = 1;
      return;
    }
    runTestConformance();
    return;
  }

  if (command === "ui" || command === "serve") {
    let port: number | undefined;
    let open = true;
    let watch = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "--port") port = Number(argv[i + 1]);
      if (arg === "--no-open") open = false;
      if (arg === "--open") open = true;
      if (arg === "--watch") watch = true;
    }
    await runUiServer({ port, open, watch });
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`kiploks failed: ${message}\n`);
  process.exit(1);
});
