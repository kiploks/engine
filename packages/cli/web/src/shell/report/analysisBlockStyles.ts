/**
 * Local report blocks: keep class strings identical to
 * private-core-saas/frontend/src/components/test-result/analysisBlockStyles.ts
 * so analysis matches Next.js.
 */

/** Card container (matches AnalysisBlockCard root on SaaS). */
export const CARD_BASE_CLASSES =
  "border border-dashed border-border rounded-sm bg-muted/30 p-4 font-mono text-sm space-y-3";

/** Nested sections (WFA, stat grids) – same as SaaS PROFESSIONAL_WFA_SECTION / static HTML. */
export const NESTED_PANEL_CLASSES =
  "border border-dashed border-border rounded-sm bg-muted/20 p-3 space-y-2 font-mono";

export const STAT_CELL_CLASSES = "border border-dashed border-border rounded-md bg-muted/20 px-3 py-2 min-w-0";

export const CARD_HEADER_TITLE_CLASS = "text-base font-semibold";

export const CARD_ACTION_BUTTON_CLASS =
  "inline-flex h-7 items-center justify-center rounded-[3px] border border-input bg-background px-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground";

export const CARD_MUTED_HINT_CLASS = "text-xs text-muted-foreground";
