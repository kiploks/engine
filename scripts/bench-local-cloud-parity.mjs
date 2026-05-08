#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  process.stderr.write(
    "Usage: node scripts/bench-local-cloud-parity.mjs <local-report.json> <cloud-analysis.json> [epsilon]\n",
  );
}

function getReportRoot(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.report && typeof raw.report === "object") return raw.report;
  return raw;
}

function flatten(value, path = "", out = {}) {
  if (Array.isArray(value)) {
    out[path] = value;
    return out;
  }
  if (value && typeof value === "object") {
    if (path) out[path] = value;
    for (const [k, v] of Object.entries(value)) {
      const next = path ? `${path}.${k}` : k;
      flatten(v, next, out);
    }
    return out;
  }
  out[path] = value;
  return out;
}

function parseFile(path) {
  const txt = readFileSync(path, "utf8");
  return JSON.parse(txt);
}

const [, , localPath, cloudPath, epsRaw] = process.argv;
if (!localPath || !cloudPath) {
  usage();
  process.exit(2);
}
const epsilon = Number.isFinite(Number(epsRaw)) ? Number(epsRaw) : 1e-9;

const local = getReportRoot(parseFile(localPath));
const cloud = getReportRoot(parseFile(cloudPath));
const L = flatten(local);
const C = flatten(cloud);

const requiredKeys = [
  "results.totalReturn",
  "results.totalTrades",
  "riskAnalysis.metrics.winRate",
  "riskAnalysis.metrics.profitFactor",
  "proBenchmarkMetrics.oosRetention",
  "proBenchmarkMetrics.wfaPassProbability",
  "decisionLogic.verdict",
  "robustnessScore.overall",
  "benchmarkComparison",
];

const failures = [];
for (const key of requiredKeys) {
  if (!(key in L)) failures.push(`local missing required key: ${key}`);
  if (!(key in C)) failures.push(`cloud missing required key: ${key}`);
}

const common = Object.keys(L).filter((k) => k in C);
const numericDiffs = [];
for (const key of common) {
  const lv = L[key];
  const cv = C[key];
  if (typeof lv === "number" && typeof cv === "number") {
    const d = Math.abs(lv - cv);
    if (Number.isFinite(d) && d > epsilon) {
      numericDiffs.push({ key, local: lv, cloud: cv, absDelta: d });
    }
  }
}

const highPriorityKeys = [
  "results.totalReturn",
  "results.totalTrades",
  "decisionLogic.verdict",
  "riskAnalysis.riskAnalysisVersion",
  "benchmarkComparison",
];
for (const k of highPriorityKeys) {
  if (k in L && k in C) {
    const lv = L[k];
    const cv = C[k];
    const same = (() => {
      if (k !== "benchmarkComparison") return JSON.stringify(lv) === JSON.stringify(cv);
      if (!lv || !cv || typeof lv !== "object" || typeof cv !== "object") {
        return JSON.stringify(lv) === JSON.stringify(cv);
      }
      const a = lv;
      const b = cv;
      const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
      for (const key of keys) {
        const av = a[key];
        const bv = b[key];
        if (typeof av === "number" && typeof bv === "number") {
          if (Math.abs(av - bv) > epsilon) return false;
          continue;
        }
        if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      }
      return true;
    })();
    if (!same) failures.push(`high-priority mismatch: ${k}`);
  }
}

process.stdout.write(`Compared local=${localPath} cloud=${cloudPath} epsilon=${epsilon}\n`);
process.stdout.write(`Common flattened keys: ${common.length}\n`);
process.stdout.write(`Numeric diffs over epsilon: ${numericDiffs.length}\n`);
if (numericDiffs.length > 0) {
  for (const row of numericDiffs.slice(0, 25)) {
    process.stdout.write(
      `  ${row.key}: local=${row.local} cloud=${row.cloud} delta=${row.absDelta}\n`,
    );
  }
}
if (failures.length > 0) {
  process.stderr.write("Parity bench FAILED:\n");
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write("Parity bench OK\n");
