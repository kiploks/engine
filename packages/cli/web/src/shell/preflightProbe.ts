import type { PreflightState } from "../legacy/types";

export type PreflightProbeError = { title: string; message: string; detail?: string };

export type PreflightProbeResult = { ok: true; data: unknown } | { ok: false; error: PreflightProbeError };

/** True when python, docker, and node blocks exist and each has ok === true (user can advance Preparation). */
export function allPreflightChecksPass(state: PreflightState): boolean {
  for (const k of ["python", "docker", "node"] as const) {
    const raw = state[k];
    const block =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { ok?: boolean }) : undefined;
    if (block?.ok !== true) return false;
  }
  return true;
}

/** Ensures the JSON is a usable preflight object (presence and shape of python, docker, node blocks). Failing checks stay in data; use allPreflightChecksPass for gating. */
export function validatePreflightPayload(data: unknown): PreflightProbeResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      error: {
        title: "Invalid preflight response",
        message:
          "The response is not a preflight object. Expected JSON with python, docker, and node blocks (each with an ok flag) as returned by POST /preflight/check.",
        detail: JSON.stringify(data, null, 2),
      },
    };
  }

  const p = data as Record<string, unknown>;
  const parts = ["python", "docker", "node"] as const;
  const missing = parts.filter((k) => !(k in p));
  if (missing.length) {
    return {
      ok: false,
      error: {
        title: "Incomplete preflight response",
        message: `Missing JSON fields: ${missing.join(", ")}. Expected the shape returned by POST /preflight/check (python, docker, node blocks with an ok flag).`,
        detail: JSON.stringify(data, null, 2),
      },
    };
  }

  return { ok: true, data: p };
}

async function parseJsonResponse(r: Response): Promise<unknown> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/**
 * Preparation step: run preflight on the server, then validate the payload.
 * Uses POST /preflight/check so we do not depend on a prior saved GET /preflight/result (avoids a dead-end before the orchestrator UI).
 */
export async function runPreflightCheckAndValidate(): Promise<PreflightProbeResult> {
  try {
    const r = await fetch("/preflight/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      return {
        ok: false,
        error: {
          title: "Preflight check failed",
          message: `The server returned HTTP ${r.status} for POST /preflight/check. The body below usually explains the issue.`,
          detail: typeof data === "object" ? JSON.stringify(data, null, 2) : String(data),
        },
      };
    }
    return validatePreflightPayload(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      error: {
        title: "Network or server unreachable",
        message: (err.message || "Could not POST /preflight/check") + ". UI cannot reach orchestrator API.",
        detail: String(err.stack || ""),
      },
    };
  }
}

/** Validates saved preflight from GET /preflight/result (optional; not used by the Preparation shell step). */
export async function probePreflightResult(): Promise<PreflightProbeResult> {
  try {
    const r = await fetch("/preflight/result");
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      return {
        ok: false,
        error: {
          title: "Preflight request failed",
          message: `The server returned HTTP ${r.status}. The response body below usually explains the issue (empty payload, wrong route, or proxy error).`,
          detail: typeof data === "object" ? JSON.stringify(data, null, 2) : String(data),
        },
      };
    }
    return validatePreflightPayload(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      error: {
        title: "Network or server unreachable",
        message: err.message || "Could not request /preflight/result",
        detail: err.stack,
      },
    };
  }
}
