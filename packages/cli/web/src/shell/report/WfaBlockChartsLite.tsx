/**
 * WFA charts for local report UI: uses `performanceTransfer` equity curves when present;
 * otherwise draws a lightweight synthetic view from `windows` / `periods` returns (pro charts in SaaS use R2-heavy data).
 */

import type { ReactNode } from "react";

type OosClass = "good" | "fragile" | "failed";

interface WindowSegment {
  window: string;
  shortLabel: string;
  isData: Array<{ date: string; value: number }>;
  oosData: Array<{ date: string; value: number }>;
  isReturn: number;
  oosReturn: number;
  efficiency: number;
  oosClass: OosClass;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const BAR_CHART_HEIGHT = 130;
const PAD = { top: 0, right: 6, bottom: 2, left: 34 };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toBalance(point: unknown): number | null {
  if (point == null) return null;
  if (typeof point === "number" && Number.isFinite(point)) return point;
  const p = point as Record<string, unknown>;
  const b = p?.value ?? p?.balance ?? p?.equity;
  return typeof b === "number" && Number.isFinite(b) ? b : null;
}

function buildSegmentsFromPerformanceTransfer(
  wfa: Record<string, unknown>,
  failedSet: Set<string>,
): WindowSegment[] {
  const pt = wfa.performanceTransfer as { windows?: unknown[] } | undefined;
  const wins = Array.isArray(pt?.windows) ? (pt?.windows as Record<string, unknown>[]) : [];
  return wins.map((windowData) => {
    const isEq = (windowData.isEquityCurve as { date: string; value: number }[]) ?? [];
    const oosEq = (windowData.oosEquityCurve as { date: string; value: number }[]) ?? [];
    const isStart = toBalance(isEq[0]) || 1;
    const normalizedIs = isEq.map((p) => ({ date: p.date, value: (toBalance(p) ?? 1) / isStart }));
    const isEnd = normalizedIs[normalizedIs.length - 1]?.value ?? 1;
    const oosStart = toBalance(oosEq[0]) || 1;
    const normalizedOos = oosEq.map((point, idx) => ({
      date: point.date,
      value: idx === 0 ? isEnd : isEnd * ((toBalance(point) ?? 1) / oosStart),
    }));
    const oosEnd = normalizedOos[normalizedOos.length - 1]?.value ?? isEnd;
    const isReturn = (isEnd - 1) * 100;
    const oosReturn = isEnd > 0 ? ((oosEnd - isEnd) / isEnd) * 100 : 0;
    const efficiency = isEnd > 0 ? oosEnd / isEnd : 0;
    const wlabel = String(windowData.window ?? "");
    let oosClass: OosClass = "good";
    if (failedSet.has(wlabel)) oosClass = "failed";
    else if (efficiency < 0.6) oosClass = "fragile";
    const shortLabel = wlabel.replace(/Period\s*/i, "P").trim() || `P${wins.indexOf(windowData) + 1}`;

    return {
      window: wlabel,
      shortLabel,
      isData: normalizedIs,
      oosData: normalizedOos,
      isReturn,
      oosReturn,
      efficiency,
      oosClass,
    };
  });
}

/**
 * isReturn / oosReturn are **percent** (e.g. 2.8 for +2.8%) to match `WfaContinuousViewContent` boundary math.
 */
function buildSegmentsSyntheticFromWindowRows(wfa: Record<string, unknown>, failedSet: Set<string>): WindowSegment[] {
  const rows = (Array.isArray(wfa.windows) ? wfa.windows : Array.isArray(wfa.periods) ? wfa.periods : []) as Record<
    string,
    unknown
  >[];
  if (!rows.length) return [];
  return rows.map((p, i) => {
    const m = p.metrics as Record<string, unknown> | undefined;
    const op = m?.optimization as Record<string, unknown> | undefined;
    const va = m?.validation as Record<string, unknown> | undefined;
    const oDec =
      (typeof p.optimizationReturn === "number" && Number.isFinite(p.optimizationReturn) ? p.optimizationReturn : null) ??
      (op?.totalReturn as number | undefined) ??
      (op?.total as number | undefined) ??
      NaN;
    const vDec =
      (typeof p.validationReturn === "number" && Number.isFinite(p.validationReturn) ? p.validationReturn : null) ??
      (va?.totalReturn as number | undefined) ??
      (va?.total as number | undefined) ??
      NaN;
    const optN = Number.isFinite(oDec) ? (oDec as number) : 0;
    const valN = Number.isFinite(vDec) ? (vDec as number) : 0;
    const isEnd = 1 + optN;
    const oosEnd = isEnd * (1 + valN);
    const isReturn = optN * 100;
    const oosReturn = valN * 100;
    const period = String(p.periodName ?? p.period ?? `Period ${i + 1}`);
    const efficiency = isEnd > 0 ? oosEnd / isEnd : 0;
    let oosClass: OosClass = "good";
    if (failedSet.has(period)) oosClass = "failed";
    else if (valN <= 0) oosClass = "failed";
    else if (efficiency < 0.6) oosClass = "fragile";
    return {
      window: period,
      shortLabel: `P${i + 1}`,
      isData: [
        { date: "0", value: 1 },
        { date: "1", value: isEnd },
      ],
      oosData: [
        { date: "0", value: isEnd },
        { date: "1", value: oosEnd },
      ],
      isReturn,
      oosReturn,
      efficiency,
      oosClass,
    };
  });
}

function buildFailedPeriodSet(wfa: Record<string, unknown>): Set<string> {
  const s = new Set<string>();
  const list = (asRecord(wfa.failedWindows)?.windows as Array<{ period?: string }> | undefined) ?? [];
  for (const w of list) {
    if (w?.period) s.add(w.period);
  }
  return s;
}

function buildBoundaries(segments: WindowSegment[]): number[] {
  const b: number[] = [1];
  for (const s of segments) {
    const afterIs = b[b.length - 1]! * (1 + s.isReturn / 100);
    b.push(afterIs);
    b.push(afterIs * (1 + s.oosReturn / 100));
  }
  return b;
}

type Props = { wfa: Record<string, unknown> };

export function WfaBlockChartsLite({ wfa }: Props): ReactNode {
  const failed = buildFailedPeriodSet(wfa);
  const pt = wfa.performanceTransfer as { windows?: unknown[] } | undefined;
  const hasCurves =
    Array.isArray(pt?.windows) &&
    pt!.windows.length > 0 &&
    (pt!.windows as Record<string, unknown>[]).some(
      (w) => Array.isArray(w.isEquityCurve) && w.isEquityCurve.length > 0 && Array.isArray(w.oosEquityCurve) && w.oosEquityCurve.length > 0,
    );
  const segments = hasCurves
    ? buildSegmentsFromPerformanceTransfer(wfa, failed)
    : buildSegmentsSyntheticFromWindowRows(wfa, failed);
  if (!segments.length) return null;

  const boundaries = buildBoundaries(segments);
  const cW = CHART_WIDTH - PAD.left - PAD.right;
  const cH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const allY: number[] = [];
  let x = 0;
  const isPolyPoints: Array<{ x: number; y: number }> = [];
  const oosSegmentsWithPoints: Array<{
    strokeClass: string;
    fillClass: string;
    points: Array<{ x: number; y: number }>;
    x1: number;
    x2: number;
  }> = [];
  const totalPoints = segments.reduce(
    (acc, s) => acc + s.isData.length + s.oosData.length,
    0,
  );

  segments.forEach((seg, i) => {
    const eIsStart = boundaries[2 * i]!;
    const eIsEnd = boundaries[2 * i + 1]!;
    const eOosEnd = boundaries[2 * i + 2]!;
    const isEndVal = seg.isData[seg.isData.length - 1]?.value ?? 1;
    const oosEndVal = seg.oosData[seg.oosData.length - 1]?.value ?? isEndVal;

    seg.isData.forEach((p) => {
      const t = isEndVal > 1 ? (p.value - 1) / (isEndVal - 1) : 0;
      const y = eIsStart + (eIsEnd - eIsStart) * t;
      isPolyPoints.push({ x, y });
      allY.push(y);
      x++;
    });
    const oosXStart = x;
    const oosPoints: Array<{ x: number; y: number }> = [];
    seg.oosData.forEach((p) => {
      const t =
        oosEndVal !== isEndVal ? (p.value - isEndVal) / (oosEndVal - isEndVal) : 0;
      const y = eIsEnd + (eOosEnd - eIsEnd) * t;
      oosPoints.push({ x, y });
      allY.push(y);
      x++;
    });
    const strokeClass =
      seg.oosClass === "failed"
        ? "stroke-red-600 dark:stroke-red-400"
        : seg.oosClass === "fragile"
          ? "stroke-amber-600 dark:stroke-amber-400"
          : "stroke-green-600 dark:stroke-green-400";
    const fillClass =
      seg.oosClass === "failed"
        ? "fill-red-600/10 dark:fill-red-400/10"
        : seg.oosClass === "fragile"
          ? "fill-amber-600/10 dark:fill-amber-400/10"
          : "fill-green-600/10 dark:fill-green-400/10";
    oosSegmentsWithPoints.push({
      strokeClass,
      fillClass,
      points: oosPoints,
      x1: oosXStart,
      x2: x - 1,
    });
  });

  const dataMinY = Math.min(...allY, 1);
  const dataMaxY = Math.max(...allY, 1);
  const dataRangeY = dataMaxY - dataMinY || 0.1;
  const marginY = dataRangeY * 0.02;
  const minY = dataMinY - marginY;
  const maxY = dataMaxY + marginY;
  const rangeY = maxY - minY || 0.1;
  const toSx = (px: number) => PAD.left + (px / Math.max(totalPoints - 1, 1)) * cW;
  const toSy = (py: number) => PAD.top + (1 - (py - minY) / rangeY) * cH;
  const isPolylinePoints = isPolyPoints.map((p) => `${toSx(p.x)},${toSy(p.y)}`).join(" ");

  const maxAbsBar = Math.max(
    ...segments.flatMap((s) => [Math.abs(s.isReturn), Math.abs(s.oosReturn)]),
    1,
  );
  const barZeroY = PAD.top + (BAR_CHART_HEIGHT - PAD.top - PAD.bottom) / 2;
  const barScale =
    (BAR_CHART_HEIGHT - PAD.top - PAD.bottom) / 2 / (maxAbsBar + 1);
  const barGroupW = (CHART_WIDTH - PAD.left - PAD.right) / segments.length;

  return (
    <div className="space-y-3" data-testid="wfa-cli-charts">
      {!hasCurves ? (
        <p className="text-[10px] text-muted-foreground">
          Approximate chart from window returns. Full IS/OOS equity segments load with performance transfer in the
          payload (SaaS pro may store curves in R2).
        </p>
      ) : null}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Walk-Forward Analysis - Continuous View
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">IS (In-Sample) + OOS (Out-of-Sample) on one timeline</p>
      </div>

      <div className="border border-dashed border-border rounded-md bg-muted/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Equity (continuous)</p>
        <svg
          width="100%"
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          {oosSegmentsWithPoints.map((seg, i) => (
            <rect
              key={i}
              x={toSx(seg.x1)}
              y={PAD.top}
              width={toSx(seg.x2) - toSx(seg.x1)}
              height={cH}
              className={seg.fillClass}
            />
          ))}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t, idx, arr) => {
            const y = minY + (1 - t) * rangeY;
            const sy = toSy(y);
            const label = rangeY <= 0.5 ? y.toFixed(2) : y.toFixed(1);
            const prevY = minY + (1 - (idx > 0 ? arr[idx - 1]! : t)) * rangeY;
            const prevLabel = rangeY <= 0.5 ? prevY.toFixed(2) : prevY.toFixed(1);
            const showLabel = idx === 0 || idx === arr.length - 1 || prevLabel !== label;
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  y1={sy}
                  x2={PAD.left + cW}
                  y2={sy}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="stroke-muted-foreground/20"
                />
                {showLabel ? (
                  <text x={PAD.left - 6} y={sy + 4} textAnchor="end" className="fill-muted-foreground text-[10px] font-mono">
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {minY < 100 && maxY > 100 && (
            <line
              x1={PAD.left}
              y1={toSy(100)}
              x2={PAD.left + cW}
              y2={toSy(100)}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4,4"
              className="stroke-border"
            />
          )}
          <polyline
            points={isPolylinePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="5,4"
            className="stroke-muted-foreground/60"
          />
          {oosSegmentsWithPoints.map((seg, i) => (
            <polyline
              key={i}
              points={seg.points.map((p) => `${toSx(p.x)},${toSy(p.y)}`).join(" ")}
              fill="none"
              strokeWidth="2"
              className={seg.strokeClass}
            />
          ))}
        </svg>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mt-2 pt-1.5 border-t border-dashed border-border">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-1 border-b-2 border-muted-foreground/50 border-dashed self-center" />
            IS
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded bg-emerald-400" />
            OOS Good
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded bg-amber-300" />
            OOS Fragile
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded bg-rose-400" />
            OOS Failed
          </span>
        </div>
      </div>

      <div className="border border-dashed border-border rounded-md bg-muted/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">OOS per period (bar)</p>
        <svg
          width="100%"
          height={BAR_CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${BAR_CHART_HEIGHT}`}
          className="overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <line
            x1={PAD.left}
            y1={barZeroY}
            x2={CHART_WIDTH - PAD.right}
            y2={barZeroY}
            stroke="currentColor"
            strokeWidth="1"
            className="stroke-border"
          />
          {segments.map((seg, i) => {
            const cx = PAD.left + i * barGroupW + barGroupW / 2;
            const bw = barGroupW * 0.28;
            const isH = Math.abs(seg.isReturn) * barScale;
            const oosH = Math.abs(seg.oosReturn) * barScale;
            const oosBarClass =
              seg.oosClass === "failed" ? "fill-rose-400" : seg.oosClass === "fragile" ? "fill-amber-300" : "fill-emerald-400";
            return (
              <g key={seg.window + String(i)}>
                <rect
                  x={cx - bw - 2}
                  y={seg.isReturn >= 0 ? barZeroY - isH : barZeroY}
                  width={bw}
                  height={isH}
                  className="fill-muted-foreground/60"
                />
                <rect
                  x={cx + 2}
                  y={seg.oosReturn >= 0 ? barZeroY - oosH : barZeroY}
                  width={bw}
                  height={oosH}
                  className={oosBarClass}
                />
                <text
                  x={cx}
                  y={BAR_CHART_HEIGHT - PAD.bottom + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-mono"
                >
                  {seg.shortLabel}
                </text>
                <text
                  x={cx - bw / 2 - 2}
                  y={seg.isReturn >= 0 ? barZeroY - isH - 4 : barZeroY + isH + 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] font-mono"
                >
                  {`${Number(seg.isReturn).toFixed(1)}%`}
                </text>
                <text
                  x={cx + bw / 2 + 2}
                  y={seg.oosReturn >= 0 ? barZeroY - oosH - 4 : barZeroY + oosH + 12}
                  textAnchor="middle"
                  className={`text-[9px] font-mono ${seg.oosClass === "failed" ? "fill-rose-400" : seg.oosClass === "fragile" ? "fill-amber-300" : "fill-emerald-400"}`}
                >
                  {`${Number(seg.oosReturn).toFixed(1)}%`}
                </text>
              </g>
            );
          })}
          <text
            x={PAD.left - 4}
            y={barZeroY - maxAbsBar * barScale + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] font-mono"
          >
            {maxAbsBar.toFixed(0)}%
          </text>
          <text x={PAD.left - 4} y={barZeroY + 4} textAnchor="end" className="fill-muted-foreground text-[10px] font-mono">
            0
          </text>
          <text
            x={PAD.left - 4}
            y={barZeroY + maxAbsBar * barScale + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] font-mono"
          >
            -{maxAbsBar.toFixed(0)}%
          </text>
        </svg>
        <div className="flex gap-4 text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-dashed border-border">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-muted-foreground/60" />
            IS
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-400" />
            OOS
          </span>
        </div>
      </div>
    </div>
  );
}
