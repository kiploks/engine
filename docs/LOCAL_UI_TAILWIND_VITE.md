# Local UI: Vite + React + Tailwind

## Goal

Move the local orchestrator browser UI from an inline JavaScript string in `ui.ts` to a **bundled** React app with **Tailwind** (single design source), while keeping the existing orchestrator and report screens under a **step shell** so the first screens stay light.

## Layout

- **Shell** (`web/src/App.tsx`): Kiploks-style dark header, **left step sidebar** (active / done / pending), **right pane** with copy and actions.
- **Steps today**
  1. Overview - short copy.
  2. Preparation - optional probe `GET /preflight/result`; failures use `ApiErrorBanner` with HTTP status, parsed or raw body, and stack when available.
  3. Orchestrator - full legacy UI mounted into `#legacy-root` inside a scroll container (same behavior as before the migration).

Back / Next behave as agreed: **Back** is allowed (clears the last preflight error when leaving step 2). **Next** on step 2 is disabled because the orchestrator is the final workspace.

## Build

From the engine repo:

```bash
npm run build -w @kiploks/engine-cli
```

This runs `vite build --config web/vite.config.mjs` (output under `packages/cli/dist/web/`) then `tsc`.

## Server routes

- `GET /` redirects to `/ui/`.
- `GET /ui` redirects to `/ui/`.
- `GET /ui/` serves `dist/web/index.html`.
- `GET /ui/assets/*` serves hashed Vite assets.

Implementation: `tryServeUiWebRequest` in `packages/cli/src/commands/ui.ts`.

## Source layout

| Path | Role |
| --- | --- |
| `packages/cli/web/vite.config.mjs` | Vite root `web/`, `base: "/ui/"`, `outDir` = `../dist/web` |
| `packages/cli/web/tailwind.config.cjs` | Theme tokens aligned with Kiploks (app-main, brand, surfaces; radius lg/md/sm как в SaaS) |
| `packages/cli/web/src/main.tsx` | React 18 root |
| `packages/cli/web/src/App.tsx` | Step shell, чекбокс на шаге 0, строгая проверка тела `GET /preflight/result` |
| `packages/cli/web/src/ApiErrorBanner.tsx` | Structured error UI |
| `packages/cli/web/src/legacy/mount.tsx` | `mountLegacyOrchestrator`, импорт `legacy-global.css` |
| `packages/cli/web/src/legacy/orchestrator-app.tsx` | Бывший `App()` - типизированные state и API |
| `packages/cli/web/src/legacy/report-view.tsx` | Бывший `ReportDetails` - пока `// @ts-nocheck` (следующий шаг - DTO отчёта) |
| `packages/cli/web/src/legacy/types.ts` | Общие типы UI (джобы, пути, preflight, kiploks UI) |
| `packages/cli/web/src/legacy/api.ts` / `json.ts` / `workflow.ts` | Мелкие утилиты |
| `packages/cli/web/src/legacy-orchestrator.ts` | Реэкспорт `mountLegacyOrchestrator` для совместимости |
| `packages/cli/web/src/legacy-global.css` | Бывший `<style>` из `renderUiHtml`, `@scope (#legacy-root)` |

## Charts

No chart in the shell for now (per product decision). The price-range reference remains a visual pattern reference only.

## Follow-ups

- Point Tailwind `content` globs reliably if warnings persist (Postcss cwd vs Vite root).
- Split `legacy-orchestrator.ts` into smaller modules and add types (remove `@ts-nocheck`).
- Wire more steps to real validation instead of only the preflight probe.
- Align tokens further with a shared cross-repo design-token source once it is available.
