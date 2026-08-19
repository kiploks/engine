import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AnalyzeConfig, Trade, WindowConfig } from "@kiploks/engine-contracts";
import { analyzeFromTrades } from "@kiploks/engine-core";
import { mapPayloadToUnified } from "@kiploks/engine-core";
import { buildTestResultDataFromUnified } from "@kiploks/engine-core/server";
import { csvToTradesFromStream } from "@kiploks/engine-adapters";
import { createReadStream } from "node:fs";

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
  return {
    ...(typeof input.seed === "number" && Number.isFinite(input.seed) ? { seed: input.seed } : {}),
    ...(typeof input.decimals === "number" && Number.isFinite(input.decimals) ? { decimals: input.decimals } : {}),
    ...(typeof input.permutationN === "number" && Number.isFinite(input.permutationN)
      ? { permutationN: input.permutationN }
      : {}),
  };
}

function toWindowConfig(input: AnalyzeTradesInput): WindowConfig {
  return {
    inSampleMonths: input.inSampleMonths ?? 6,
    outOfSampleMonths: input.outOfSampleMonths ?? 2,
    stepMode: input.stepMode ?? "rolling",
  };
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
    throw new Error("JSON input must be an array of trades (Trade[]). Bot export JSON is not supported in-tree.");
  }

  const balance = initialBalance ?? 1;
  const out: Trade[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    if (!row || typeof row !== "object") continue;
    const profit = Number.isFinite(Number(row.profit))
      ? Number(row.profit)
      : Number.isFinite(Number(row.profit_ratio))
        ? Number(row.profit_ratio)
        : Number.isFinite(Number(row.profit_abs))
          ? Number(row.profit_abs) / balance
          : null;
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
  if (out.length === 0) {
    throw new Error("No valid trades found in input file");
  }
  return out;
}

export async function analyzeTradesFile(input: AnalyzeTradesInput): Promise<unknown> {
  const trades = await loadTrades(input.inputPath, input.initialBalance);
  const windowConfig = toWindowConfig(input);
  const config = buildConfig(input);
  return analyzeFromTrades(
    {
      trades,
      windowConfig,
      wfaInputMode: "tradeSlicedPseudoWfa",
    },
    config,
  );
}

export async function analyzeIntegrationPayloadFile(inputPath: string): Promise<unknown> {
  const abs = path.resolve(inputPath);
  const raw = JSON.parse(await readFile(abs, "utf8")) as Record<string, unknown>;
  const unified = mapPayloadToUnified(raw);
  return buildTestResultDataFromUnified(unified, `mcp_${Date.now()}`);
}

export async function analyzeIntegrationPayloadObject(payload: Record<string, unknown>): Promise<unknown> {
  const unified = mapPayloadToUnified(payload);
  return buildTestResultDataFromUnified(unified, `mcp_${Date.now()}`);
}
