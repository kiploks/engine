import type { PreflightState } from "../legacy/types";

const CHECK_KEYS = ["python", "docker", "node"] as const;

const LABELS: Record<(typeof CHECK_KEYS)[number], string> = {
  python: "Python",
  docker: "Docker",
  node: "Node.js",
};

type OsFamily = "darwin" | "win" | "linux" | "unknown";

function detectOsFamily(): OsFamily {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua)) return "darwin";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

/** Actionable steps so a failed check tells users how to unblock the orchestrator. */
function whatToDoSteps(check: (typeof CHECK_KEYS)[number], os: OsFamily): string[] {
  if (check === "python") {
    if (os === "darwin") {
      return [
        "Install Python 3 so `python3` is on PATH (for example `brew install python`, or an installer from python.org).",
        "Fully quit and reopen the terminal (or IDE) you use to start the orchestrator, then run `python3 --version`.",
        "Start the Kiploks UI again and run Preflight once PATH picks up the new binary.",
      ];
    }
    if (os === "win") {
      return [
        "Install Python 3 from python.org or the Microsoft Store and enable adding Python to PATH in the installer.",
        "Open a new terminal and run `py --version` or `python --version`.",
        "Restart the orchestrator from that same terminal and run Preflight again.",
      ];
    }
    if (os === "linux") {
      return [
        "Install Python 3 with your distro (for example `sudo apt install python3` on Debian/Ubuntu).",
        "Confirm `python3 --version` works in the shell where you start the orchestrator.",
        "Restart `kiploks ui` (or your dev server) and run Preflight again.",
      ];
    }
    return [
      "Install Python 3 so at least one of the commands the server tries (`python3` or `python` on Unix, `py`/`python` on Windows) exists on PATH.",
      "Restart the terminal and the orchestrator process after changing PATH, then run Preflight again.",
    ];
  }
  if (check === "docker") {
    if (os === "darwin" || os === "win") {
      return [
        "Install and start Docker Desktop. Wait until it reports that the engine is running.",
        "In a new terminal, run `docker version`. Both Client and Server sections should respond.",
        "Start the orchestrator from an environment where that same `docker` binary is on PATH.",
      ];
    }
    if (os === "linux") {
      return [
        "Install Docker Engine (or Docker Desktop for Linux) and start the daemon (`sudo systemctl start docker` or your distro equivalent).",
        "Run `docker version` as the same user that will run integrations; fix permissions or use the `docker` group if you see permission errors.",
        "Restart the orchestrator and run Preflight again.",
      ];
    }
    return [
      "Install the Docker CLI and a running Docker engine so `docker` commands work in the shell that launches the orchestrator.",
      "If the CLI works but the check fails, the daemon is usually not running - start Docker Desktop or the `docker` service.",
    ];
  }
  // node
  return [
    "This block reflects the Node.js runtime used by the orchestrator. Normally it always passes.",
    "Install or reinstall an LTS Node.js, then restart the `kiploks ui` (or `npm run dev`) process completely.",
    "If you only see this in Demo mode, use Run Preflight for a real result.",
  ];
}

function humanizeField(key: string): string {
  const map: Record<string, string> = {
    commandTried: "Commands checked",
    version: "Version",
    message: "Message",
    error: "Error",
    path: "Path",
    command: "Command",
    stdout: "Output",
    stderr: "Errors",
  };
  return map[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(key: string, val: unknown): string {
  if (Array.isArray(val) && val.every((x) => typeof x === "string")) {
    return (val as string[]).join(", ");
  }
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  if (val === null || val === undefined) {
    return "";
  }
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function linesFromBlock(block: Record<string, unknown> | undefined): string[] {
  if (!block || typeof block !== "object") {
    return ["No data was returned for this check."];
  }
  const lines: string[] = [];
  for (const [key, val] of Object.entries(block)) {
    if (key === "ok") continue;
    if (val === undefined || val === null) continue;
    const text = formatValue(key, val);
    if (!text) continue;
    lines.push(`${humanizeField(key)}: ${text}`);
  }
  if (lines.length === 0) {
    lines.push("No extra details beyond the pass or fail status.");
  }
  return lines;
}

function statusPill(ok: boolean | undefined): { label: string; className: string } {
  if (ok === true) return { label: "Passed", className: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" };
  if (ok === false) return { label: "Failed", className: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30" };
  return { label: "Unknown", className: "bg-white/10 text-muted-foreground ring-1 ring-white/10" };
}

type Props = { state: PreflightState };

export function PreflightSummary({ state }: Props) {
  const checked = state.checkedAt ? String(state.checkedAt) : null;
  const os = detectOsFamily();

  return (
    <div className="mt-3 space-y-5">
      {checked ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Last check: </span>
          {(() => {
            const d = new Date(checked);
            return Number.isNaN(d.getTime()) ? checked : d.toLocaleString();
          })()}
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        The server looks for usable Python and Docker CLI tools on this machine and reports the Node version used by the
        orchestrator.
      </p>

      <ul className="space-y-3">
        {CHECK_KEYS.map((key) => {
          const raw = state[key];
          const block =
            raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
          const ok = typeof block?.ok === "boolean" ? block.ok : undefined;
          const pill = statusPill(ok);

          return (
            <li
              key={key}
              className="rounded-lg border border-border bg-secondary p-5 shadow-inner shadow-black/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-foreground">{LABELS[key]}</h4>
                <span className={"rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide " + pill.className}>
                  {pill.label}
                </span>
              </div>
              {ok === false ? (
                <>
                  <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">What to do</p>
                    <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-foreground/95">
                      {whatToDoSteps(key, os).map((stepText, i) => (
                        <li key={i} className="break-words marker:font-medium">
                          {stepText}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Technical details</p>
                </>
              ) : null}
              <ul
                className={
                  ok === false
                    ? "mt-2 list-none space-y-2 text-sm leading-relaxed text-muted-foreground"
                    : "mt-4 list-none space-y-2 text-sm leading-relaxed text-muted-foreground"
                }
              >
                {linesFromBlock(block).map((line, i) => (
                  <li key={i} className="break-words pl-0">
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
