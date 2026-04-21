import { useState, type MouseEvent } from "react";
import type { LocalReportDetails } from "./types";

type Props = {
  /** Full `GET /api/reports/:id` payload (id, report, rawPayload, …). */
  detail: LocalReportDetails | null;
  className?: string;
};

/**
 * Collapsed-by-default full JSON dump for copy-paste and debugging. Not a substitute for
 * `report` DTO invariants; it mirrors what the local orchestrator returns.
 */
export function ReportFullJsonPanel({ detail, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  if (detail == null) return null;

  const text = JSON.stringify(detail, null, 2);

  const onCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={
        "rounded-lg border border-dashed border-border bg-muted/20 font-mono text-xs text-foreground " + className
      }
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-foreground marker:content-[''] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 shrink-0 text-center text-[10px] text-muted-foreground transition-transform group-open:rotate-90">▶</span>
            Full report JSON
          </span>
        </summary>
        <div className="border-t border-border/80 px-2 pb-2 pt-1">
          <div className="mb-1 flex items-center justify-end gap-2">
            <span className="mr-auto pl-1 text-[11px] text-muted-foreground">
              API response: id, source, <code className="text-foreground/90">report</code>, <code className="text-foreground/90">rawPayload</code>, …
            </span>
            <button
              type="button"
              onClick={onCopy}
              className="shrink-0 rounded border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-muted/40"
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>
          <pre className="max-h-[min(70vh,32rem)] overflow-auto rounded-md border border-border/60 bg-card/80 p-3 text-[11px] leading-relaxed text-foreground/95">
            {text}
          </pre>
        </div>
      </details>
    </div>
  );
}
