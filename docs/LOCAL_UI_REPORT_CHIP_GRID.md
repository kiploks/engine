# Local UI report: chip grid for key-value sections

## Goal

Show dense scalar blocks in the local orchestrator report UI as a readable 2-column grid of cards (label + pill-shaped value), instead of a flat bullet list. This matches the layout introduced for `Robustness modules` and is now reused for other report sections.

## Where it lives

- **Orchestrator + report client**: `engine/packages/cli/web/src/legacy-orchestrator.ts` (Vite bundle, ESM React).
- **Report / orchestrator scoped CSS**: `engine/packages/cli/web/src/legacy-global.css` (`@scope (#legacy-root)` so Tailwind shell classes stay separate).
- **HTTP**: `engine/packages/cli/src/commands/ui.ts` serves `dist/web/` for `GET /ui/` and assets.

See also `engine/docs/LOCAL_UI_TAILWIND_VITE.md` for the step shell and build pipeline.

## CSS building blocks

| Class | Role |
| --- | --- |
| `robust-grid` | 2-column CSS grid for cards |
| `robust-item` | One field: label + value |
| `robust-chip` | Pill container for the formatted value |
| `robust-chip-good` / `robust-chip-warn` / `robust-chip-bad` / `robust-chip-neutral` | Semantic color for the pill |
| `robust-flag-chips` / `robust-flag-chip` | Wrapped row of neutral pills for long flag lists |
| `robust-item .robust-chip` | Allows long strings (for example DQG diagnosis) to wrap |

## JavaScript helpers (inside `ReportDetails`)

1. **`chipToneForKv(label, raw)`**  
   Picks a chip color from the raw value and the field label (lowercased path for nested keys). Heuristics cover:

   - Robustness blockers: `blockedByModule`, `blockedByModules`
   - Booleans: negative-sounding keys treat `true` as bad (`blocked`, `failure`, …); deployment-style keys treat `true` as good
   - Numbers in `[0, 1]`: green / amber / red thresholds (same idea as robustness module scores)
   - Numbers in `(1, 100]`: scaled as `/100` for the same thresholds (useful for scores shown as `0-100`)
   - Drawdown-style negatives: more negative than about `-20%` reads as bad (label matches `drawdown`, `mdd`, …)
   - Short strings: common verdict tokens (`PASS`, `FAIL`, …) without regex word-boundary escapes (those would break inside the outer template literal that emits `app.js`)

2. **`chipGridItems(pairs, keyPrefix)`**  
   Takes `[label, raw][]`, runs `compactRows`, formats with existing `formatCell`, renders `robust-item` nodes. Keys use `keyPrefix` to stay stable in lists.

3. **`kvChipGridSection(title, pairs, keyPrefix)`**  
   One `report-section` with an `h3` and a single `robust-grid` of items.

4. **`robustnessSection()`**  
   Still the only section with **two** titled sub-blocks (`Module gates` and `Components`); it now uses `chipGridItems` so tone logic stays centralized.

## Sections using the chip grid

| Section | Data source |
| --- | --- |
| Robustness modules | `rob.modules`, `rob.*`, `rob.components.*` |
| Risk (all scalars) | `collectPrimitives` on `riskAnalysis` (+ `risk.metrics`) |
| Pro benchmark metrics | `collectPrimitives` on `proBenchmarkMetrics` |
| Parameter sensitivity - diagnostics | `paramSensitivity.diagnostics` |
| Parameter sensitivity - top parameters | First parameters + `.sensitivity` |
| Data quality (DQG) | `dataQualityGuardResult` / `dataQualityGuard` scalar fields |
| DQG modules | `dqg.modules[]` - card per module: name, verdict chip, optional truncated `details` JSON |
| Decision summary | `decisionSummary` scalars in the same grid; positive/risk flag tiers use `robust-flag-chips` |
| Turnover & cost drag | `turnoverAndCostDrag` via `collectPrimitives` |

Sections that stay as before (list or table) include `Strategy`, `Walk-forward`, `Benchmark`, canonical tables, WFA window table, and so on.

## Edge cases

- **Empty section**: `compactRows` removes null/empty values; if nothing remains, `kvChipGridSection` returns `null` and nothing is rendered.
- **Very long labels**: paths from `collectPrimitives` stay in the left column; values wrap inside the chip.
- **Template literal safety**: regexes inside `renderUiAppJs()` must not use escapes that the outer template eats (for example `\b`). Prefer explicit string equality or simple alternation regexes.

## How to extend

1. Add CSS only in `renderUiHtml()` if you need new visual variants (keep namespaced under `robust-` or a new prefix).
2. Add or adjust heuristics in `chipToneForKv` when new boolean or verdict fields need clearer coloring.
3. For new scalar dumps, prefer `kvChipGridSection("Title", rows, "uniquePrefix")` if rows are `[label, value]` pairs.
