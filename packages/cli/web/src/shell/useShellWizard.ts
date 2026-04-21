import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mountLegacyOrchestrator } from "../legacy/mount";
import type { PreflightState } from "../legacy/types";
import { readInitialWorkflow } from "../legacy/workflow";
import {
  allPreflightChecksPass,
  runPreflightCheckAndValidate,
  type PreflightProbeError,
} from "./preflightProbe";
import type { ShellStepIndex } from "./stepMeta";

function initialShellStep(): ShellStepIndex {
  if (typeof window === "undefined") return 0;
  return /^#report=/.test(String(window.location.hash || "")) ? 4 : 0;
}

export function useShellWizard() {
  const initial = initialShellStep();
  const [step, setStep] = useState<ShellStepIndex>(initial);
  const [maxReachedStep, setMaxReachedStep] = useState<ShellStepIndex>(initial);
  const [preflightError, setPreflightError] = useState<PreflightProbeError | null>(null);
  const [preflightSnapshot, setPreflightSnapshot] = useState<PreflightState | null>(null);
  const [loading, setLoading] = useState(false);
  const [step0Ack, setStep0Ack] = useState(false);
  const [bootstrapGateOk, setBootstrapGateOk] = useState(false);
  const [integrationRunGateOk, setIntegrationRunGateOk] = useState(false);
  const legacyHost = useRef<HTMLDivElement>(null);

  const preparationGateOk = useMemo(() => {
    if (!preflightSnapshot) return false;
    return allPreflightChecksPass(preflightSnapshot);
  }, [preflightSnapshot]);

  useEffect(() => {
    setMaxReachedStep((m) => (step > m ? step : m));
  }, [step]);

  useEffect(() => {
    if (step !== 2 && step !== 3) {
      setBootstrapGateOk(false);
      return;
    }
    const wf = readInitialWorkflow();
    if (wf === "csv") {
      setBootstrapGateOk(true);
      return;
    }
    const integration = wf;
    const poll = async () => {
      try {
        const r = await fetch("/jobs");
        const data = (await r.json()) as unknown;
        const list = Array.isArray(data) ? data : [];
        const ok = list.some((j: unknown) => {
          if (!j || typeof j !== "object" || Array.isArray(j)) return false;
          const job = j as { type?: string; status?: string; result?: { integration?: string } };
          return (
            job.type === "integration_bootstrap" &&
            job.status === "succeeded" &&
            job.result?.integration === integration
          );
        });
        setBootstrapGateOk(ok);
      } catch {
        setBootstrapGateOk(false);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 4000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== 3) {
      setIntegrationRunGateOk(false);
      return;
    }
    const wf = readInitialWorkflow();
    if (wf === "csv") {
      const poll = async () => {
        try {
          const r = await fetch("/jobs");
          const data = (await r.json()) as unknown;
          const list = Array.isArray(data) ? data : [];
          const ok = list.some((j: unknown) => {
            if (!j || typeof j !== "object" || Array.isArray(j)) return false;
            const job = j as { type?: string; status?: string };
            return job.type === "csv_analyze" && job.status === "succeeded";
          });
          setIntegrationRunGateOk(ok);
        } catch {
          setIntegrationRunGateOk(false);
        }
      };
      void poll();
      const id = window.setInterval(() => void poll(), 4000);
      return () => window.clearInterval(id);
    }
    const integration = wf;
    const poll = async () => {
      try {
        const r = await fetch("/jobs");
        const data = (await r.json()) as unknown;
        const list = Array.isArray(data) ? data : [];
        const ok = list.some((j: unknown) => {
          if (!j || typeof j !== "object" || Array.isArray(j)) return false;
          const job = j as { type?: string; status?: string; result?: { integration?: string } };
          return (
            job.type === "integration_run" && job.status === "succeeded" && job.result?.integration === integration
          );
        });
        setIntegrationRunGateOk(ok);
      } catch {
        setIntegrationRunGateOk(false);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 4000);
    return () => window.clearInterval(id);
  }, [step]);

  const goToShellStep = useCallback((target: ShellStepIndex) => {
    setStep(target);
  }, []);

  useEffect(() => {
    if (step < 2 || step > 3) return;
    const el = legacyHost.current;
    if (!el) return;
    el.innerHTML = "";
    const mountEl = document.createElement("div");
    mountEl.id = "legacy-root";
    el.appendChild(mountEl);
    const shellPhase =
      step === 2
        ? "repository"
        : "workspace-activity";
    const unmount = mountLegacyOrchestrator(mountEl, { shellPhase, goToShellStep });
    return () => {
      window.setTimeout(() => {
        try {
          unmount();
        } finally {
          if (mountEl.parentNode === el) {
            el.removeChild(mountEl);
          }
        }
      }, 0);
    };
  }, [step, goToShellStep]);

  const runPreflightProbe = useCallback(async (): Promise<boolean> => {
    setPreflightError(null);
    setLoading(true);
    try {
      const result = await runPreflightCheckAndValidate();
      if (!result.ok) {
        setPreflightError(result.error);
        setPreflightSnapshot(null);
        return false;
      }
      setPreflightError(null);
      const data = result.data as PreflightState;
      setPreflightSnapshot(data);
      return allPreflightChecksPass(data);
    } finally {
      setLoading(false);
    }
  }, []);


  const onContinue = useCallback(async () => {
    if (step === 0) {
      if (!step0Ack) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!preparationGateOk) return;
      const ok = await runPreflightProbe();
      if (ok) setStep(2);
      return;
    }
    if (step === 2) {
      if (!bootstrapGateOk) return;
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!integrationRunGateOk) return;
      setStep(4);
      return;
    }
    if (step === 4) {
      return;
    }
  }, [step, step0Ack, preparationGateOk, bootstrapGateOk, integrationRunGateOk, runPreflightProbe]);

  const onBack = useCallback(() => {
    if (step <= 0) return;
    setPreflightError(null);
    if (step === 1) setStep0Ack(false);
    setStep((s) => (s - 1) as ShellStepIndex);
  }, [step]);

  const goToStep = useCallback(
    (target: ShellStepIndex) => {
      if (loading) return;
      if (target > maxReachedStep) return;
      if (target === step) return;
      setPreflightError(null);
      if (target === 0 && step === 1) setStep0Ack(false);
      setStep(target);
    },
    [loading, maxReachedStep, step],
  );

  return {
    step,
    maxReachedStep,
    preflightError,
    preflightSnapshot,
    loading,
    step0Ack,
    setStep0Ack,
    preparationGateOk,
    bootstrapGateOk,
    integrationRunGateOk,
    legacyHost,
    runPreflightProbe,
    onContinue,
    onBack,
    goToStep,
  };
}
