import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { csvToTradesFromStream } from "@kiploks/engine-adapters";
import type { AnalyzeConfig, Trade, WindowConfig } from "@kiploks/engine-contracts";
import { analyzeFromTrades, mapPayloadToUnified } from "@kiploks/engine-core";
import { buildTestResultDataFromUnified } from "@kiploks/engine-core/server";

export type AnalyzeTradesInput = {
  inputPath: string;
  inSampleMonths?: number;
  outOfSampleMonths?: number;
  stepMode?: "rolling" | "anchored";
  seed?: number;
  decimals?: number;
  permutationN?: number;
  initialBalance?: number;
};

function buildConfig(input: AnalyzeTradesInput): AnalyzeConfig {
  const config: AnalyzeConfig = {};
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) config.seed = input.seed;
  if (typeof input.decimals === "number" && Number.isFinite(input.decimals)) config.decimals = input.decimals;
  if (typeof input.permutationN === "number" && Number.isFinite(input.permutationN)) {
    config.permutationN = input.permutationN;
  }
  return config;
}

function toWindowConfig(input: AnalyzeTradesInput): WindowConfig {
  return {
    inSampleMonths: input.inSampleMonths ?? 6,
    outOfSampleMonths: input.outOfSampleMonths ?? 2,
    stepMode: input.stepMode ?? "rolling",
  };
}

function parseProfit(row: Record<string, unknown>, balance: number): number | null {
  if (Number.isFinite(Number(row.profit))) return Number(row.profit);
  if (Number.isFinite(Number(row.profit_ratio))) return Number(row.profit_ratio);
  if (Number.isFinite(Number(row.profit_abs))) return Number(row.profit_abs) / balance;
  return null;
}

async function loadTrades(inputPath: string, initialBalance?: number): Promise<Trade[]> {
  const abs = path.resolve(inputPath);
  if (abs.toLowerCase().endsWith(".csv")) {
    return csvToTradesFromStream(createReadStream(abs), {
      profit: "profit",
      openTime: "openTime",
      closeTime: "closeTime",
    });
  }

  const raw = JSON.parse(await readFile(abs, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("JSON input must be Trade[] array. Bot export JSON is not supported in-tree.");
  }

  const balance = initialBalance ?? 1;
  const out: Trade[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    if (!row || typeof row !== "object") continue;
    const profit = parseProfit(row, balance);
    const openTime = Number(row.openTime ?? row.open_timestamp);
    const closeTime = Number(row.closeTime ?? row.close_timestamp);
    if (profit == null || !Number.isFinite(openTime) || !Number.isFinite(closeTime)) continue;
    out.push({
      profit,
      openTime,
      closeTime,
      ...(typeof row.symbol === "string" ? { symbol: row.symbol } : {}),
      ...(typeof row.direction === "string" ? { direction: row.direction as Trade["direction"] } : {}),
    });
  }
  if (out.length === 0) throw new Error("No valid trades found in input file");
  return out;
}

export async function analyzeTradesFile(input: AnalyzeTradesInput): Promise<unknown> {
  return analyzeFromTrades(
    {
      trades: await loadTrades(input.inputPath, input.initialBalance),
      windowConfig: toWindowConfig(input),
      wfaInputMode: "tradeSlicedPseudoWfa",
    },
    buildConfig(input),
  );
}

export async function analyzeIntegrationPayloadFile(inputPath: string): Promise<unknown> {
  const raw = JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as Record<string, unknown>;
  return buildTestResultDataFromUnified(mapPayloadToUnified(raw), `mcp_${Date.now()}`);
}
