/**
 * App chrome aligned with private-core-saas Header (logo, tagline, sticky gradient bar).
 * Local UI has no auth nav; right side shows context badge + product link.
 */
export function ShellAppHeader() {
  return (
    <header
      className={
        "font-inter sticky top-0 z-50 border-b border-border backdrop-blur-md transition-colors duration-300 " +
        "bg-gradient-to-b from-app-header via-sky-950/[0.14] to-app-header shadow-[0_1px_0_0_rgba(99,102,241,0.1)]"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 md:min-h-[5.25rem] md:px-6">
        <a href="./" className="flex min-w-0 flex-col no-underline hover:opacity-95">
          <span className="logo whitespace-nowrap text-lg font-bold tracking-tight">
            <span className="text-brand">Kiploks</span>
            <span className="text-foreground"> Robustness Engine</span>
          </span>
          <span className="font-mono text-xs tracking-tighter text-muted-foreground">
            Strategy robustness before capital deployment
          </span>
        </a>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <span className="rounded border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Local orchestrator
          </span>
          <a
            href="https://kiploks.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-2 py-1 text-sm font-medium text-brand transition hover:text-brand-hover hover:underline"
          >
            Kiploks.com
          </a>
        </div>
      </div>
    </header>
  );
}
