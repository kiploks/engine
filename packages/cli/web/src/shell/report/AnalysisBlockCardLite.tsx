import { useState } from "react";
import {
  CARD_ACTION_BUTTON_CLASS,
  CARD_BASE_CLASSES,
  CARD_HEADER_TITLE_CLASS,
} from "./analysisBlockStyles";

type Props = {
  title: string;
  tooltip?: string;
  className?: string;
  copyPayload?: unknown;
  children: React.ReactNode;
};

export function AnalysisBlockCardLite({ title, tooltip, className = "", copyPayload, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (copyPayload == null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(copyPayload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      /* ignore clipboard errors */
    }
  };

  return (
    <section className={CARD_BASE_CLASSES + " " + className}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className={CARD_HEADER_TITLE_CLASS}>{title}</h3>
          {tooltip ? (
            <span
              className="flex h-4 w-4 cursor-help items-center justify-center text-xs text-muted-foreground transition hover:scale-110 hover:text-foreground"
              title={tooltip}
            >
              [?]
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {copyPayload != null ? (
            <button
              type="button"
              onClick={() => void onCopy()}
              className={CARD_ACTION_BUTTON_CLASS}
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-muted-foreground hover:text-foreground text-sm transition"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "[+]" : "[-]"}
          </button>
        </div>
      </div>
      <div
        className={
          "overflow-hidden transition-all duration-200 ease-out " +
          (collapsed ? "max-h-0 opacity-0 mt-0" : "max-h-[5000px] opacity-100 mt-3 space-y-3")
        }
      >
        {children}
      </div>
    </section>
  );
}
