import type {ReactNode} from "react";
import {ShellAppHeader} from "./ShellAppHeader";
import type {ShellStepIndex} from "./stepMeta";
import {SHELL_STEPS} from "./stepMeta";

type Props = {
  step: ShellStepIndex;
  maxReachedStep: ShellStepIndex;
  loading: boolean;
  onStepSelect: (index: ShellStepIndex) => void;
  children: ReactNode;
  footer: ReactNode;
};

export function StepShellLayout({ step, maxReachedStep, loading, onStepSelect, children, footer }: Props) {
  return (
    <div className="min-h-screen bg-app-main text-foreground">
      <ShellAppHeader />

      <div className="mx-auto flex w-full min-w-0 max-w-6xl gap-10 px-6 pb-10 pt-3">
        <aside className="sticky top-24 h-[calc(100vh-24rem)] w-56 shrink-0 overflow-auto pt-1">
          {SHELL_STEPS.map((s, i) => {
            const idx = i as ShellStepIndex;
            const unlocked = idx <= maxReachedStep;
            const circle =
              i === step
                ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30"
                : i < step
                  ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-sm font-semibold text-primary"
                  : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/30 text-sm font-semibold text-muted-foreground";
            return (
              <div key={s.k} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={circle}>{i < step ? "OK" : i + 1}</div>
                  {i < SHELL_STEPS.length - 1 ? <div className="my-1 min-h-8 w-px flex-1 bg-border" /> : null}
                </div>
                <div className="min-w-0 flex-1 pb-8">
                  {unlocked ? (
                    <button
                      type="button"
                      disabled={loading}
                      className={
                        "w-full rounded-lg border border-transparent px-2 py-1 text-left transition " +
                        (i === step
                          ? "border-primary/35 bg-primary/[0.07] shadow-sm shadow-primary/10"
                          : "hover:border-primary/20 hover:bg-primary/[0.04]") +
                        " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                        "disabled:cursor-wait disabled:opacity-60"
                      }
                      aria-current={i === step ? "step" : undefined}
                      onClick={() => onStepSelect(idx)}
                    >
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.name}</p>
                      <p className={"mt-0.5 text-sm font-medium leading-tight " + (i === step ? "text-foreground" : "text-muted-foreground")}>
                        {s.title}
                      </p>
                    </button>
                  ) : (
                    <div className="cursor-not-allowed rounded-lg px-2 py-1 opacity-40" aria-disabled>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.name}</p>
                      <p className={"mt-0.5 text-sm font-medium leading-tight text-muted-foreground"}>{s.title}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1 basis-0">
          {children}
          {footer}
        </main>
      </div>
    </div>
  );
}
