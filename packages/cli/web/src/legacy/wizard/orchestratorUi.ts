/**
 * Tailwind class bundles for the orchestrator workspace (step 3), aligned with the shell (App / StepShellLayout).
 */
export const oc = {
  root: "text-foreground antialiased",
  stack: "flex flex-col gap-5",
  panel: "rounded-panel border border-border bg-card p-5 shadow-lg shadow-black/20",
  panelTitle: "text-base font-semibold text-foreground",
  panelSectionTitle: "text-sm font-semibold text-foreground",
  panelHint: "mt-1 text-xs leading-relaxed text-muted-foreground",
  badge: "inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary",
  fieldLabel: "mt-3 block text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0",
  checkRow: "mt-3 flex items-center gap-2 text-sm text-muted-foreground",
  checkInput: "h-4 w-4 shrink-0 rounded border border-input bg-background text-primary focus:ring-2 focus:ring-ring/40",
  input:
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/40",
  textarea:
    "mt-1 min-h-[140px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/40",
  select:
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/40",
  monoBlock:
    "mt-2 max-h-56 overflow-auto rounded-lg border border-dashed border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground",
  monoBlockTall:
    "mt-2 max-h-72 overflow-auto rounded-lg border border-dashed border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground",
  btnPrimary:
    "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
  btnSecondary:
    "inline-flex items-center justify-center rounded-lg border border-border bg-secondary px-4 py-2.5 text-base font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40",
  row: "mt-3 flex flex-wrap items-center gap-2",
  rowStretch: "mt-3 flex flex-wrap items-stretch gap-2",
  divider: "my-5 border-t border-border",
  statusReady: "text-sm font-medium text-emerald-400",
  statusBusy: "text-sm font-medium text-amber-300",
} as const;
