/* Large legacy view: strict report DTO types - incremental follow-up. */
// @ts-nocheck
import React, { useEffect, useState } from "react";
import { json } from "./json";

type ReportPayload = {
  report?: unknown;
  error?: string;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function ReportDetails({ reportId }: { reportId: string }) {
  const [data, setData] = useState<ReportPayload | null>(null);
  useEffect(() => {
    if (!reportId) return;
    fetch("/api/reports/" + reportId)
      .then((r) => r.json())
      .then((body: unknown) => setData(body as ReportPayload))
      .catch(() => setData({ error: "Failed to load report" }));
  }, [reportId]);
  if (!data) {
    return React.createElement("pre", { className: "mono" }, "Loading report...");
  }
  if (data.error) {
    return React.createElement("pre", { className: "mono" }, json(data));
  }

  const report = asRecord(data.report);
  const strategy = asRecord(report.strategy);
  const results = asRecord(report.results);
  const wfa = asRecord(report.walkForwardAnalysis);
  const prof = asRecord(wfa.professional);
  const mcFromProfessional = prof["monteCarloValidation"] != null ? asRecord(prof["monteCarloValidation"]) : null;
  const mcFromTopLevel = report["monteCarloSimulation"] != null ? asRecord(report["monteCarloSimulation"]) : null;
  const mc = mcFromProfessional || mcFromTopLevel;
  const mcSourceLabel = mcFromProfessional
    ? "walkForwardAnalysis.professional.monteCarloValidation"
    : mcFromTopLevel
      ? "monteCarloSimulation"
      : null;
  const profMeta = asRecord(wfa["professionalMeta"]);
  const risk = asRecord(report["riskAnalysis"]);
  const rob = asRecord(report["robustnessScore"]);
  const dqg = asRecord(report["dataQualityGuardResult"] ?? report["dataQualityGuard"]);
  const bench = asRecord(report["benchmarkComparison"]);
  const verdict = asRecord(report["verdictPayload"]);
  const pro = asRecord(report["proBenchmarkMetrics"]);
  const ps = asRecord(report["parameterSensitivity"]);
  const toc = asRecord(report["turnoverAndCostDrag"]);
  const canon = asRecord(report["canonicalMetrics"]);
  const mods = asRecord(rob["modules"]);
  const comps = asRecord(rob["components"]);

  const isNA = (v: unknown): boolean => {
    if (v == null) return true;
    if (typeof v === "number" && !Number.isFinite(v)) return true;
    const s = String(v).trim();
    return s === "" || /^n\/a%?$/i.test(s);
  };
  const compactRows = (rows: [string, unknown][]) => rows.filter((r) => !isNA(r[1]));

  const formatGradeLikeObject = (o: Record<string, unknown>): string | null => {
    if (typeof o.grade !== "string") return null;
    const parts = [];
    parts.push(o.grade);
    if (typeof o.score === "number" && Number.isFinite(o.score)) parts.push("score " + o.score.toFixed(1));
    if (typeof o.status === "string" && o.status.trim()) parts.push(o.status);
    if (o.isDeployable === true) parts.push("deployable");
    else if (o.isDeployable === false) parts.push("not deployable");
    if (typeof o.executionWarning === "string" && o.executionWarning.trim()) parts.push(o.executionWarning);
    return parts.join(" - ");
  };

  const formatCell = (label: string, v: unknown): string | null => {
    if (isNA(v)) return null;
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (typeof v === "string") return v;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const asGrade = formatGradeLikeObject(o);
      if (asGrade) return asGrade;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return String(v);
    const L = String(label || "").toLowerCase();
    if (/sharpe|sortino|calmar|kurtosis|zscore|omega|skew/i.test(L)) return v.toFixed(4);
    if (/winrate|win_rate/i.test(L) && Math.abs(v) <= 1.0001) return (v * 100).toFixed(1) + "%";
    if (/bps|netedge|edge.*bps|slippage.*bps/i.test(L)) return v.toFixed(1) + " bps";
    if (/consistency|wfe|efficiency|passrate|retention|degradation|decay|stabilityindex|psi/i.test(L)) {
      if (Math.abs(v) <= 1.0001) return (v * 100).toFixed(1) + "%";
      return v.toFixed(2);
    }
    if (/drawdown|cagr|return|profit|yield/i.test(L)) {
      if (Math.abs(v) <= 2) return (v * 100).toFixed(2) + "%";
      return v.toFixed(2) + "%";
    }
    if (/score|overall|grade|count|total|windows|trades|days|index/i.test(L) && Number.isInteger(v)) return String(v);
    if (Math.abs(v) >= 1000 || (Math.abs(v) < 1e-4 && v !== 0)) return v.toExponential(3);
    return Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(4);
  };

  const chipToneForKv = (label, raw) => {
    const L = String(label || "").toLowerCase();
    if (label === "blockedByModule" || label === "blockedByModules") {
      return String(raw || "").trim() !== "" ? "robust-chip-bad" : "robust-chip-good";
    }
    if (typeof raw === "boolean") {
      if (/blocked|failure|critic|invalid/i.test(L)) return raw ? "robust-chip-bad" : "robust-chip-good";
      if (/readiness|deploy|pass|enable/i.test(L)) return raw ? "robust-chip-good" : "robust-chip-bad";
      return raw ? "robust-chip-good" : "robust-chip-bad";
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      if (/drawdown|mdd|maxdd/i.test(L) && raw < 0) {
        if (raw <= -0.2) return "robust-chip-bad";
        if (raw >= -0.05) return "robust-chip-good";
        return "robust-chip-warn";
      }
      if (Math.abs(raw) <= 1.0001) {
        const x = Math.abs(raw);
        if (x >= 0.8) return "robust-chip-good";
        if (x < 0.5) return "robust-chip-bad";
        return "robust-chip-warn";
      }
      if (raw > 1.0001 && raw <= 100) {
        const score = raw / 100;
        if (score >= 0.8) return "robust-chip-good";
        if (score < 0.5) return "robust-chip-bad";
        return "robust-chip-warn";
      }
      return "robust-chip-neutral";
    }
    if (typeof raw === "string") {
      if (raw.length > 56 && !/verdict|risk level/i.test(L)) return "robust-chip-neutral";
      const u = raw.trim().toUpperCase();
      if (/PASS|APPROVED|ROBUST/.test(u) && !/FAIL|REJECT|BLOCK|CRITICAL/.test(u)) return "robust-chip-good";
      if (/FAIL|REJECT|BLOCK|CRITICAL|FRAGILE/.test(u)) return "robust-chip-bad";
      if (u === "YES" || u === "OK" || u === "LOW") return "robust-chip-good";
      if (u === "NO" || u === "HIGH") return "robust-chip-bad";
    }
    return "robust-chip-neutral";
  };

  const chipGridItems = (pairs, keyPrefix) =>
    compactRows(pairs).map(([label, raw], idx) => {
      const text = formatCell(label, raw) || String(raw);
      const tone = chipToneForKv(label, raw);
      return React.createElement("div", { className: "robust-item", key: keyPrefix + "_" + idx },
        React.createElement("div", { className: "k mono" }, label),
        React.createElement("span", { className: "robust-chip mono " + tone }, text)
      );
    });

  const kvChipGridSection = (title, pairs, keyPrefix) => {
    const items = chipGridItems(pairs, keyPrefix);
    if (!items.length) return null;
    return React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, title),
      React.createElement("div", { className: "robust-block" },
        React.createElement("div", { className: "robust-grid" }, ...items)
      )
    );
  };

  const section = (title, rows) => {
    const visible = compactRows(rows);
    if (!visible.length) return null;
    return (
    React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, title),
      React.createElement("ul", { className: "report-list mono" },
        ...visible.map((r, i) =>
          React.createElement("li", { key: title + "_" + i }, r[0] + ": " + (formatCell(r[0], r[1]) || "N/A"))
        )
      )
    )
    );
  };
  const robustnessSection = () => {
    const moduleRows = chipGridItems([
      ["validation", mods.validation],
      ["risk", mods.risk],
      ["stability", mods.stability],
      ["execution", mods.execution],
      ["blockedByModule", rob.blockedByModule],
      ["blockedByModules", rob.blockedByModules ? rob.blockedByModules.join(", ") : undefined],
      ["potentialOverall", rob.potentialOverall],
    ], "mod");
    const componentRows = chipGridItems([
      ["component parameterStability", comps.parameterStability],
      ["component timeRobustness", comps.timeRobustness],
      ["component marketRegime", comps.marketRegime],
      ["component monteCarloStability", comps.monteCarloStability],
      ["component sensitivity", comps.sensitivity],
      ["component dataQuality", comps.dataQuality],
    ], "cmp");
    if (!moduleRows.length && !componentRows.length) return null;
    return React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, "Robustness modules"),
      moduleRows.length > 0 && React.createElement("div", { className: "robust-block" },
        React.createElement("p", { className: "robust-block-title mono" }, "Module gates"),
        React.createElement("div", { className: "robust-grid" }, ...moduleRows)
      ),
      componentRows.length > 0 && React.createElement("div", { className: "robust-block" },
        React.createElement("p", { className: "robust-block-title mono" }, "Components"),
        React.createElement("div", { className: "robust-grid" }, ...componentRows)
      )
    );
  };

  const collectPrimitives = (obj, prefix, depth, maxDepth, maxRows, skipKeys) => {
    const rows = [];
    const skip = skipKeys || new Set();
    const walk = (o, pfx, d) => {
      if (rows.length >= maxRows || o == null) return;
      const t = typeof o;
      if (t === "number" || t === "boolean" || t === "string") {
        rows.push([pfx, o]);
        return;
      }
      if (d >= maxDepth) return;
      if (Array.isArray(o)) {
        rows.push([pfx, "array[" + o.length + "]"]);
        return;
      }
      if (t !== "object") return;
      for (const k of Object.keys(o)) {
        if (rows.length >= maxRows) return;
        if (skip.has(k)) continue;
        const v = o[k];
        const path = pfx ? pfx + "." + k : k;
        if (v != null && typeof v === "object" && !Array.isArray(v)) walk(v, path, d + 1);
        else if (v != null && (typeof v === "number" || typeof v === "boolean" || typeof v === "string"))
          rows.push([path, v]);
      }
    };
    walk(obj, prefix, 0);
    return rows;
  };

  const kpi = compactRows([
    ["Final verdict", verdict.verdict || verdict.finalVerdictLabel],
    ["Robustness score", rob.overall],
    ["WFE", wfa.wfe],
    ["WFA verdict", wfa.verdict],
    ["Max drawdown", risk.maxDrawdown],
    ["Net edge bps", bench.netEdgeBps],
    ["Investability", report.investabilityGrade],
    ["Execution grade", report.executionGrade],
  ]).map((r) => [r[0], formatCell(r[0], r[1]) || "N/A"]);

  const riskRows = collectPrimitives(risk, "risk", 0, 3, 48, new Set(["metrics"]));
  const riskFromMetrics = risk.metrics && typeof risk.metrics === "object"
    ? collectPrimitives(risk.metrics, "risk.metrics", 0, 2, 32, new Set())
    : [];
  const proSkip = new Set([
    "metricDefinitions",
    "metricDefinitionVersions",
    "metricsRegistry",
    "textPayload",
    "wfeDistribution",
  ]);
  const proRows = collectPrimitives(pro, "pro", 0, 2, 56, proSkip);
  const diag = ps.diagnostics && typeof ps.diagnostics === "object"
    ? collectPrimitives(ps.diagnostics, "paramSensitivity", 0, 2, 48, new Set())
    : [];
  const tocRows = collectPrimitives(toc, "turnover", 0, 2, 40, new Set(["textPayload"]));
  const mcRows = mc
    ? collectPrimitives(mc, "monteCarlo", 0, 3, 36, new Set())
    : [];
  const mcStab = comps.monteCarloStability;
  const mcStabLabel =
    mcStab != null && typeof mcStab === "number" && Number.isFinite(mcStab)
      ? formatCell("consistency", mcStab) || String(mcStab)
      : mcStab != null
        ? String(mcStab)
        : "N/A";
  const monteCarloSection = React.createElement("section", { className: "report-section" },
    React.createElement("h3", null, "Monte Carlo"),
    React.createElement("p", { className: "mono", style: { fontSize: "11px", color: "#9fb0e6", margin: "0 0 8px" } },
      "Main table: fields from walkForwardAnalysis.professional.monteCarloValidation, with fallback to monteCarloSimulation. " +
        "Robustness score also exposes component monteCarloStability (see line below; often N/A if MC block was not computed)."
    ),
    mcSourceLabel && React.createElement("p", { className: "mono", style: { margin: "0 0 8px", color: "#9fb0e6" } },
      "Data source: " + mcSourceLabel
    ),
    React.createElement("p", { className: "mono", style: { margin: "0 0 8px", color: "#b9c6f5" } },
      "Robustness component monteCarloStability: " + mcStabLabel
    ),
    mc
      ? React.createElement(React.Fragment, null,
          mcRows.length > 0 &&
            React.createElement("ul", { className: "report-list mono" },
              ...mcRows.map(([k, v], i) =>
                React.createElement("li", { key: "mc_" + i }, k + ": " + (formatCell(k, v) || String(v)))
              )
            ),
          mcRows.length === 0 && React.createElement("pre", { className: "mono" }, json(mc).slice(0, 2400)),
          React.createElement("details", { style: { marginTop: "8px" } },
            React.createElement("summary", { className: "mono" }, "monteCarloValidation (full JSON)"),
            React.createElement("pre", { className: "mono" }, json(mc))
          )
        )
      : React.createElement("p", { className: "mono" },
          "No Monte Carlo block found in known paths (walkForwardAnalysis.professional.monteCarloValidation or monteCarloSimulation). " +
            'Search Full report JSON for "monteCarlo" or open the API payload details.'
        )
  );

  const paramList = Array.isArray(ps.parameters) ? ps.parameters : [];
  const paramPreview = paramList.slice(0, 12).map((p, i) => {
    const name = (p && p.name) || "param_" + i;
    const sens = p && p.sensitivity;
    return [name + ".sensitivity", sens];
  });

  const wfaWindows = Array.isArray(wfa.windows) ? wfa.windows : [];
  const wfaPeriods = Array.isArray(wfa.periods) ? wfa.periods : [];

  const scalarFieldsFromObject = (obj, maxRows) => {
    const out = [];
    if (!obj || typeof obj !== "object") return out;
    for (const k of Object.keys(obj)) {
      if (out.length >= maxRows) break;
      const v = obj[k];
      if (v == null) continue;
      const t = typeof v;
      if (t === "number" || t === "boolean") {
        out.push([k, v]);
      } else if (t === "string") {
        out.push([k, v.length > 160 ? v.slice(0, 160) + "…" : v]);
      } else if (Array.isArray(v)) {
        out.push([k, "array[" + v.length + "]"]);
      } else if (t === "object") {
        try {
          const s = JSON.stringify(v);
          out.push([k, s.length > 220 ? s.slice(0, 220) + "…" : s]);
        } catch (_) {}
      }
    }
    return out;
  };

  const kvTableSection = (title, pairs) => {
    if (!pairs || !pairs.length) return null;
    return React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, title),
      React.createElement("div", { className: "wfa-table-wrap" },
        React.createElement("table", { className: "wfa-table mono" },
          React.createElement("thead", null,
            React.createElement("tr", null,
              React.createElement("th", null, "Field"),
              React.createElement("th", null, "Value")
            )
          ),
          React.createElement("tbody", null,
            ...pairs.map((pair, i) =>
              React.createElement("tr", { key: "kv_" + title + "_" + i },
                React.createElement("td", null, pair[0]),
                React.createElement("td", null,
                  typeof pair[1] === "string" && (pair[1].startsWith("{") || pair[1].startsWith("["))
                    ? pair[1]
                    : (formatCell(pair[0], pair[1]) || String(pair[1]))
                )
              )
            )
          )
        )
      )
    );
  };

  const fmtCellLbl = (lbl, v) => {
    const t = formatCell(lbl, v);
    return t == null || t === "N/A" ? "-" : t;
  };

  const wm = Array.isArray(canon.wfaWindowMetrics) ? canon.wfaWindowMetrics : [];
  const wfaWindowTable =
    wm.length > 0 &&
    React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, "WFA windows (canonicalMetrics.wfaWindowMetrics)"),
      React.createElement("p", { className: "mono", style: { fontSize: "11px", color: "#9fb0e6", margin: "0 0 8px" } },
        "Per-window metrics: IS = in-sample, OOS = out-of-sample. Use horizontal scroll on narrow screens."
      ),
      React.createElement("div", { className: "wfa-table-wrap" },
        React.createElement("table", { className: "wfa-table mono" },
          React.createElement("thead", null,
            React.createElement("tr", null,
              ...["#", "Start", "End", "IS ret", "IS Sharpe", "IS PF", "IS MDD", "IS WR", "IS trades", "OOS ret", "OOS Sharpe", "OOS PF", "OOS MDD", "OOS WR", "OOS trades", "Sharpe ret.", "Return ret."].map((h, hi) =>
                React.createElement("th", { key: "wmh_" + hi }, h)
              )
            )
          ),
          React.createElement("tbody", null,
            ...wm.map((row, ri) => {
              const dr = row.dateRange || {};
              const ism = row.isMetrics || {};
              const oos = row.oosMetrics || {};
              const rowData = [
                row.window != null ? row.window : ri,
                dr.start || "",
                dr.end || "",
                ism.totalReturn,
                ism.sharpeRatio,
                ism.profitFactor,
                ism.maxDrawdown,
                ism.winRate,
                ism.totalTrades,
                oos.totalReturn,
                oos.sharpeRatio,
                oos.profitFactor,
                oos.maxDrawdown,
                oos.winRate,
                oos.totalTrades,
                row.sharpeRetention,
                row.returnRetention,
              ];
              const colLabels = [
                "index", "dateFrom", "dateTo",
                "IS return", "Sharpe", "profitFactor", "drawdown", "winRate", "totalTrades",
                "OOS return", "Sharpe", "profitFactor", "drawdown", "winRate", "totalTrades",
                "Sharpe retention", "Return retention",
              ];
              return React.createElement(
                "tr",
                { key: "wmr_" + ri },
                ...rowData.map((c, ci) =>
                  React.createElement(
                    "td",
                    { key: "wmc_" + ri + "_" + ci },
                    ci < 3 ? String(c == null ? "" : c) : fmtCellLbl(colLabels[ci], c)
                  )
                )
              );
            })
          )
        )
      )
    );

  const fullBtPairs = scalarFieldsFromObject(canon.fullBacktestMetrics, 96);
  const oosCanonPairs = scalarFieldsFromObject(canon.oosMetrics, 96);

  const dsRaw = report.decisionSummary;
  const ds = dsRaw && typeof dsRaw === "object" ? dsRaw : null;
  const verdictToneClass = (t) => {
    const u = String(t == null || t === "" ? "UNKNOWN" : t).toUpperCase();
    if (/PASS|APPROVED|ROBUST/.test(u)) return "verdict-pass";
    if (/FAIL|REJECT|NOT RECOMMENDED|FRAGILE/.test(u)) return "verdict-fail";
    return "verdict-warn";
  };
  const verdictLabel = String(
    verdict.verdict || verdict.finalVerdictLabel || ds?.verdict || wfa.verdict || "UNKNOWN"
  ).toUpperCase();
  const verdictClass = verdictToneClass(verdictLabel);
  const wfaFailed = wfa.failedWindows
    ? Number(wfa.failedWindows.count || 0) + "/" + Number(wfa.failedWindows.total || 0)
    : "N/A";
  const deployReady =
    ds?.deploymentReadiness === true
      ? "yes"
      : ds?.deploymentReadiness === false
        ? "no"
        : (report.executionGrade ? String(report.executionGrade) : "N/A");
  const actionItems = [];
  if (rob.blockedByModule) {
    actionItems.push("Unblock robustness module: " + String(rob.blockedByModule));
  }
  if (wfa.verdict && String(wfa.verdict).toUpperCase() === "FAIL") {
    actionItems.push("Improve WFA stability: reduce failed windows and increase consistency.");
  }
  if (typeof risk.maxDrawdown === "number" && risk.maxDrawdown < -0.2) {
    actionItems.push("Reduce drawdown with stricter risk controls and lower leverage.");
  }
  if (typeof bench.netEdgeBps === "number" && bench.netEdgeBps < 0) {
    actionItems.push("Raise net edge above costs (optimize entries/exits or lower execution drag).");
  }
  if (!actionItems.length) {
    actionItems.push("No hard blockers detected. Validate with additional OOS windows before scaling.");
  }
  const tierFlags = (bucket, tier) => {
    if (!bucket || typeof bucket !== "object") return [];
    const a = bucket[tier];
    return Array.isArray(a) ? a.map((x) => String(x)) : [];
  };
  const flagsCol = (title, buckets, kind) => {
    if (!buckets || typeof buckets !== "object") return null;
    const tiers = ["simple", "pro", "inst"];
    const blocks = tiers
      .map((tier) => {
        const arr = tierFlags(buckets, tier);
        if (!arr.length) return null;
        return React.createElement("div", { key: kind + "_" + tier, style: { marginBottom: "8px" } },
          React.createElement("div", { className: "mono", style: { fontSize: "10px", color: "#9fb0e6" } }, tier),
          React.createElement("div", { className: "robust-flag-chips" },
            ...arr.map((f, i) =>
              React.createElement("span", {
                key: kind + "_" + tier + "_" + i,
                className: "robust-chip mono robust-chip-neutral robust-flag-chip",
              }, f)
            )
          )
        );
      })
      .filter(Boolean);
    if (!blocks.length) return null;
    return React.createElement("div", { style: { flex: 1, minWidth: "200px" } },
      React.createElement("h4", { style: { margin: "0 0 6px", fontSize: "12px", color: "#c5d0f8" } }, title),
      ...blocks
    );
  };
  const fmtDsConfidence = (c) => {
    if (typeof c !== "number" || !Number.isFinite(c)) return "-";
    if (c >= 0 && c <= 1) return (c * 100).toFixed(0) + "%";
    return String(c);
  };
  const posCol = ds ? flagsCol("Positive flags", ds.positiveFlags, "p") : null;
  const riskCol = ds ? flagsCol("Risk flags", ds.riskFlags, "r") : null;
  const flagsRow =
    ds &&
    (posCol || riskCol) &&
    React.createElement("div", { className: "row", style: { marginTop: "12px", alignItems: "flex-start", gap: "12px" } }, ...[posCol, riskCol].filter(Boolean));
  const decisionSummaryUi =
    ds &&
    React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, "Decision summary"),
      React.createElement("div", { className: "robust-block" },
        React.createElement(
          "div",
          { className: "robust-grid" },
          ...chipGridItems(
            [
              ["Verdict", ds.verdict],
              ["Confidence", ds.confidence],
              ["Risk level", ds.riskLevel],
              ["Deployment readiness", ds.deploymentReadiness],
              ["Recommended allocation", ds.recommendedAllocation],
            ],
            "ds"
          )
        )
      ),
      flagsRow,
      React.createElement("details", { style: { marginTop: "10px" } },
        React.createElement("summary", { className: "mono" }, "decisionSummary (raw JSON)"),
        React.createElement("pre", { className: "mono" }, json(ds))
      )
    );

  const dqgModulesSection =
    Array.isArray(dqg.modules) && dqg.modules.length > 0 &&
    React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, "DQG modules"),
      React.createElement("div", { className: "robust-block" },
        React.createElement(
          "div",
          { className: "robust-grid" },
          ...dqg.modules.map((m, i) => {
            const modName = String(m.module || "?");
            const ver = m.verdict;
            const tone = chipToneForKv("Verdict", ver);
            const details = m.details ? JSON.stringify(m.details) : "";
            const detShow = details.length > 220 ? details.slice(0, 220) + "..." : details;
            return React.createElement("div", { className: "robust-item", key: "dqgm_" + i },
              React.createElement("div", { className: "k mono" }, modName),
              React.createElement("span", { className: "robust-chip mono " + tone },
                formatCell("Verdict", ver) || String(ver == null ? "N/A" : ver)
              ),
              detShow
                ? React.createElement("div", { className: "mono report-subtle", style: { marginTop: "8px", lineHeight: 1.35 } }, detShow)
                : null
            );
          })
        )
      )
    );

  const heroVerdictChip = (tag, raw) => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return React.createElement("span", { key: "hv_" + tag, className: "verdict-chip " + verdictToneClass(raw) },
      React.createElement("span", { className: "hero-chip-tag" }, tag + ":"),
      " ",
      s.toUpperCase()
    );
  };
  const heroVerdictPills = [
    heroVerdictChip("DS", ds && ds.verdict),
    heroVerdictChip("WFA", wfa.verdict),
    heroVerdictChip("DQG", dqg.verdict),
  ].filter(Boolean);
  const heroEdge = formatCell("netEdgeBps", bench.netEdgeBps) || "N/A";
  const heroDd = formatCell("maxDrawdown", risk.maxDrawdown) || "N/A";
  const heroRet = formatCell("totalReturn", results.totalReturn) || "N/A";
  const heroRobBlock =
    rob.blockedByModules && Array.isArray(rob.blockedByModules) && rob.blockedByModules.length
      ? rob.blockedByModules.join(", ")
      : rob.blockedByModule
        ? String(rob.blockedByModule)
        : "";
  let heroAlert = "";
  if (heroRobBlock) heroAlert = "Robustness blocked: " + heroRobBlock;
  if (dqg.blocked === true) heroAlert += (heroAlert ? " | " : "") + "DQG blocked";
  if (dqg.isCriticalFailure === true) heroAlert += (heroAlert ? " | " : "") + "DQG critical failure";

  return React.createElement(React.Fragment, null,
    React.createElement("section", { className: "report-hero" },
      React.createElement("div", { className: "report-hero-head" },
        React.createElement("div", { className: "report-hero-title" }, "Strategy decision"),
        React.createElement("span", { className: "verdict-chip " + verdictClass }, verdictLabel)
      ),
      React.createElement("div", { className: "report-subtle" },
        "Symbol: " + String(strategy.symbol || "N/A") +
          " | Timeframe: " + String(strategy.timeframe || "N/A") +
          " | Test window: " + String(strategy.testPeriodStart || "N/A") + " -> " + String(strategy.testPeriodEnd || "N/A")
      ),
      heroVerdictPills.length > 0 &&
        React.createElement("div", { className: "hero-chip-row" }, ...heroVerdictPills),
      React.createElement("div", { className: "hero-nums mono" },
        "Net edge ",
        React.createElement("strong", null, heroEdge),
        " | Max DD ",
        React.createElement("strong", null, heroDd),
        " | Total return ",
        React.createElement("strong", null, heroRet),
        " | WFE ",
        React.createElement("strong", null, formatCell("wfe", wfa.wfe) || "N/A"),
        " | DQG ",
        React.createElement("strong", null, dqg.verdict != null && String(dqg.verdict).trim() !== "" ? String(dqg.verdict) : "N/A")
      ),
      heroAlert &&
        React.createElement("div", { className: "hero-alert mono" }, heroAlert),
      React.createElement("div", { className: "metric-chip-row" },
        React.createElement("div", { className: "metric-chip" },
          React.createElement("span", { className: "k" }, "Robustness"),
          React.createElement("span", { className: "v mono" }, formatCell("overall", rob.overall) || "N/A")
        ),
        React.createElement("div", { className: "metric-chip" },
          React.createElement("span", { className: "k" }, "WFA"),
          React.createElement("span", { className: "v mono" }, String(wfa.verdict || "N/A") + " (" + wfaFailed + ")")
        ),
        React.createElement("div", { className: "metric-chip" },
          React.createElement("span", { className: "k" }, "Confidence"),
          React.createElement("span", { className: "v mono" }, ds ? fmtDsConfidence(ds.confidence) : "N/A")
        ),
        React.createElement("div", { className: "metric-chip" },
          React.createElement("span", { className: "k" }, "Deployment"),
          React.createElement("span", { className: "v mono" }, deployReady)
        ),
        formatCell("Investability", report.investabilityGrade) &&
          React.createElement("div", { className: "metric-chip", key: "hero_inv" },
            React.createElement("span", { className: "k" }, "Investability"),
            React.createElement("span", { className: "v mono" }, formatCell("Investability", report.investabilityGrade))
          ),
        formatCell("Execution grade", report.executionGrade) &&
          React.createElement("div", { className: "metric-chip", key: "hero_ex" },
            React.createElement("span", { className: "k" }, "Execution"),
            React.createElement("span", { className: "v mono" }, formatCell("Execution grade", report.executionGrade))
          )
      )
    ),
    React.createElement("div", { className: "insight-grid" },
      ...[
        ["Total return", formatCell("totalReturn", results.totalReturn) || "N/A"],
        ["Max drawdown", formatCell("maxDrawdown", risk.maxDrawdown) || "N/A"],
        ["Sharpe", formatCell("sharpeRatio", risk.sharpeRatio) || "N/A"],
        ["Net edge", formatCell("netEdgeBps", bench.netEdgeBps) || "N/A"],
        ["WFE", formatCell("wfe", wfa.wfe) || "N/A"],
        ["Consistency", formatCell("consistency", wfa.consistency) || "N/A"],
        ["Failed windows", wfaFailed],
        ["Trades", formatCell("totalTrades", results.totalTrades) || "N/A"],
      ].map((pair, i) =>
        React.createElement("div", { className: "insight", key: "ins_" + i },
          React.createElement("div", { className: "k" }, pair[0]),
          React.createElement("div", { className: "v mono" }, pair[1])
        )
      )
    ),
    React.createElement("section", { className: "report-section" },
      React.createElement("h3", null, "Action plan"),
      React.createElement("ul", { className: "action-list mono" },
        ...actionItems.slice(0, 5).map((line, i) => React.createElement("li", { key: "act_" + i }, line))
      )
    ),
    kpi.length > 0 && React.createElement("div", { className: "report-grid" },
      ...kpi.map((item, idx) =>
        React.createElement("div", { className: "report-kpi", key: "kpi_" + idx },
          React.createElement("div", { className: "label" }, item[0]),
          React.createElement("div", { className: "value mono" }, item[1])
        )
      )
    ),
    section("Strategy", [
      ["name", strategy.name],
      ["symbol", strategy.symbol],
      ["timeframe", strategy.timeframe],
      ["exchange", strategy.exchange],
      ["test window", (strategy.testPeriodStart || "") + " → " + (strategy.testPeriodEnd || "")],
      ["parametersCount", strategy.parametersCount],
    ]),
    section("Backtest summary", [
      ["totalTrades", results.totalTrades],
      ["totalReturn", results.totalReturn],
    ]),
    section("Walk-forward", [
      ["Verdict", wfa.verdict],
      ["WFE", wfa.wfe],
      ["Consistency", wfa.consistency],
      ["Windows count", wfaWindows.length || undefined],
      ["Periods count", wfaPeriods.length || undefined],
      ["Failed windows", wfa.failedWindows ? (wfa.failedWindows.count + "/" + wfa.failedWindows.total) : undefined],
      ["Performance degradation", wfa.performanceDegradation],
      ["monteCarloValidation (pro WFA)", mc ? "present" : "missing"],
    ]),
    monteCarloSection,
    profMeta && Object.keys(profMeta).length > 0 &&
      React.createElement("section", { className: "report-section" },
        React.createElement("h3", null, "Professional meta"),
        React.createElement("pre", { className: "mono" }, json(profMeta).slice(0, 2400))
      ),
    robustnessSection(),
    kvChipGridSection("Risk (all scalars)", riskRows.concat(riskFromMetrics), "risk"),
    kvChipGridSection("Pro benchmark metrics", proRows, "pro"),
    kvChipGridSection("Parameter sensitivity - diagnostics", diag, "psd"),
    kvChipGridSection("Parameter sensitivity - top parameters", paramPreview, "psp"),
    kvChipGridSection("Turnover & cost drag", tocRows, "toc"),
    section("Benchmark", [
      ["Net edge bps", bench.netEdgeBps],
      ["Strategy CAGR", bench.strategyCAGR],
      ["Benchmark CAGR", bench.benchmarkCAGR],
    ]),
    kvChipGridSection("Data quality (DQG)", [
      ["Verdict", dqg.verdict],
      ["Final score", dqg.finalScore],
      ["Blocked", dqg.blocked],
      ["Diagnosis", dqg.diagnosis],
      ["isCriticalFailure", dqg.isCriticalFailure],
      ["factor", dqg.factor],
    ], "dqg"),
    dqgModulesSection,
    kvTableSection("Canonical - full backtest (fullBacktestMetrics)", fullBtPairs),
    kvTableSection("Canonical - OOS block (oosMetrics)", oosCanonPairs),
    wfaWindowTable,
    Array.isArray(report.integrityIssues) && report.integrityIssues.length > 0 &&
      React.createElement("section", { className: "report-section" },
        React.createElement("h3", null, "Integrity issues"),
        React.createElement("ul", { className: "report-list mono" },
          ...report.integrityIssues.map((iss, i) =>
            React.createElement("li", { key: "int_" + i }, typeof iss === "string" ? iss : json(iss))
          )
        )
      ),
    decisionSummaryUi,
    React.createElement("details", { style: { marginTop: "10px" } },
      React.createElement("summary", { className: "mono" }, "Full report JSON"),
      React.createElement("pre", { className: "mono" }, json(report))
    ),
    React.createElement("details", { style: { marginTop: "6px" } },
      React.createElement("summary", { className: "mono" }, "API payload (raw)"),
      React.createElement("pre", { className: "mono" }, json(data))
    )
  );
}
