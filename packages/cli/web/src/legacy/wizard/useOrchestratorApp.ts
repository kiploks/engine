import { useEffect, useMemo, useRef, useState } from "react";
import { useOrchestratorShellPhase } from "../../shell/orchestratorShellBridge";
import { api } from "../api";
import type {
  KiploksUiState,
  PreflightState,
  UiBacktestArtifact,
  UiJob,
  UiPathRow,
  UiReportRow,
  WorkflowIntegration,
} from "../types";
import { readInitialWorkflow, WORKFLOW_KEY, type WorkflowType } from "../workflow";
import {
  getOrchestratorLayoutStep,
  orchestratorLayoutProgressLine,
  orchestratorLayoutStepTitle,
  type OrchestratorLayoutStep,
} from "./integrationStepModel";

function normalizeKiploksDraft(state: KiploksUiState | null): string | null {
  if (!state) return null;
  return JSON.stringify({
    apiTarget: state.apiTarget,
    config: state.config || {},
  });
}

function extractApiErrorMessage(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === "string") {
    const t = payload.trim();
    return t || null;
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return String(payload);
  }
  if (Array.isArray(payload)) {
    const parts = payload.map((x) => extractApiErrorMessage(x)).filter((x): x is string => !!x);
    return parts.length ? parts.join("; ") : null;
  }
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const direct =
      extractApiErrorMessage(obj.error) ||
      extractApiErrorMessage(obj.message) ||
      extractApiErrorMessage(obj.details) ||
      extractApiErrorMessage(obj.reason);
    if (direct) return direct;
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
  return null;
}

export function useOrchestratorApp() {
  const [workflowType, setWorkflowType] = useState<WorkflowType>(readInitialWorkflow);
  const [paths, setPaths] = useState<UiPathRow[]>([]);
  const [jobs, setJobs] = useState<UiJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [bootstrapMode, setBootstrapMode] = useState("safe-merge");
  const [runMode, setRunMode] = useState("docker");
  const [kiploksUi, setKiploksUi] = useState<KiploksUiState | null>(null);
  const [kiploksUiBaseline, setKiploksUiBaseline] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("profit\n0.1\n-0.05\n0.2\n");
  const [preflight, setPreflight] = useState<PreflightState | null>(null);
  const [status, setStatus] = useState("Ready");
  const [reports, setReports] = useState<UiReportRow[]>([]);
  const [cloudAnalyzeLinks, setCloudAnalyzeLinks] = useState<Array<{ url?: string; createdAt?: string }>>([]);
  const [backtestArtifacts, setBacktestArtifacts] = useState<UiBacktestArtifact[]>([]);
  const [selectedBacktestArtifactKey, setSelectedBacktestArtifactKey] = useState("");
  const [backtestArtifactsLoading, setBacktestArtifactsLoading] = useState(false);
  const [backtestArtifactsLog, setBacktestArtifactsLog] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const jobsRequestInFlightRef = useRef(false);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) || null, [jobs, selectedJobId]);
  const isCsvFlow = workflowType === "csv";
  const integration: WorkflowIntegration = isCsvFlow ? "freqtrade" : (workflowType as WorkflowIntegration);

  const integrationRunJobs = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.type !== "integration_run") return false;
        const target = j.result?.integration;
        return target ? target === integration : true;
      }),
    [jobs, integration],
  );
  const activeIntegrationJob = integrationRunJobs[0] || null;
  const selectedReport = useMemo(() => reports.find((r) => r.id === selectedReportId) || null, [reports, selectedReportId]);
  const hasPreflightOk = !!(preflight?.python?.ok && preflight?.docker?.ok && preflight?.node?.ok);
  const hasPathForIntegration = paths.some((p) => p.integration === integration);
  const hasBootstrapDone = jobs.some(
    (j) => j.type === "integration_bootstrap" && j.status === "succeeded" && j.result?.integration === integration,
  );
  const canRunIntegration = hasPreflightOk && hasPathForIntegration && hasBootstrapDone;
  const hasKiploksChanges = useMemo(
    () => normalizeKiploksDraft(kiploksUi) !== kiploksUiBaseline,
    [kiploksUi, kiploksUiBaseline],
  );

  const shellPhase = useOrchestratorShellPhase();

  const orchestratorLayoutStep: OrchestratorLayoutStep = useMemo(() => {
    if (shellPhase === "repository") return 3;
    if (shellPhase === "workspace-integration" || shellPhase === "workspace-activity") return 4;
    return getOrchestratorLayoutStep({ isCsvFlow, hasPathForIntegration });
  }, [shellPhase, isCsvFlow, hasPathForIntegration]);

  const stepTitle = useMemo(
    () => orchestratorLayoutStepTitle(orchestratorLayoutStep, isCsvFlow),
    [orchestratorLayoutStep, isCsvFlow],
  );

  const progressLine = useMemo(
    () =>
      orchestratorLayoutProgressLine({
        isCsvFlow,
        hasPreflightOk,
        hasPathForIntegration,
        hasBootstrapDone,
        canRunIntegration,
      }),
    [isCsvFlow, hasPreflightOk, hasPathForIntegration, hasBootstrapDone, canRunIntegration],
  );

  const runModes = integration === "freqtrade" ? ["docker"] : ["host", "wrapper"];

  const refreshJobs = async () => {
    if (jobsRequestInFlightRef.current) return;
    jobsRequestInFlightRef.current = true;
    try {
    const data = await api.get("/jobs");
    const list = Array.isArray(data) ? (data as UiJob[]) : [];
    setJobs(list);
    if (!selectedJobId && list[0]?.id) setSelectedJobId(list[0].id);
    } finally {
      jobsRequestInFlightRef.current = false;
    }
  };

  const refreshPaths = async () => {
    const data = await api.get("/paths");
    setPaths(Array.isArray(data) ? (data as UiPathRow[]) : []);
  };

  const refreshReports = async () => {
    const data = await api.get("/api/reports");
    const list = Array.isArray(data) ? (data as UiReportRow[]) : [];
    setReports(list);
    if (!selectedReportId && list[0]?.id) setSelectedReportId(list[0].id);
  };

  const refreshCloudAnalyzeLinks = async () => {
    const data = await api.get("/api/cloud-analyze-links");
    setCloudAnalyzeLinks(Array.isArray(data) ? (data as Array<{ url?: string; createdAt?: string }>) : []);
  };

  const refreshBacktestArtifacts = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (isCsvFlow || integration !== "freqtrade" || !hasPathForIntegration) {
      setBacktestArtifacts([]);
      setSelectedBacktestArtifactKey("");
      if (!silent) setBacktestArtifactsLoading(false);
      setBacktestArtifactsLog("Backtest list is available only for Freqtrade after repository path is registered.");
      return;
    }
    if (!silent) setBacktestArtifactsLoading(true);
    try {
      const data = await api.get("/integrations/backtests?integration=freqtrade");
      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as { items?: unknown; log?: unknown })
          : null;
      const isLegacyArrayResponse = Array.isArray(data);
      const listRaw = payload ? payload.items : data;
      const list = Array.isArray(listRaw) ? (listRaw as UiBacktestArtifact[]) : [];
      setBacktestArtifacts(list);
      const hasCurrent = list.some((x) => String(x.artifactKey || "") === selectedBacktestArtifactKey);
      if (selectedBacktestArtifactKey && !hasCurrent) {
        setSelectedBacktestArtifactKey("");
      }
      const backendLog = payload && typeof payload.log === "string" ? payload.log : "";
      if (backendLog && !silent) {
        setBacktestArtifactsLog(backendLog);
      } else if (list.length === 0) {
        setBacktestArtifactsLog(
          isLegacyArrayResponse
            ? "No backtest artifacts found."
            : "No backtest artifacts found. Check user_data/backtest_results and run at least one backtest.",
        );
      } else {
        setBacktestArtifactsLog(`Loaded ${list.length} backtest artifact(s).`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!silent) {
        setBacktestArtifacts([]);
        setBacktestArtifactsLog(`Failed to load backtest artifacts: ${msg}`);
      }
    } finally {
      if (!silent) setBacktestArtifactsLoading(false);
    }
  };

  const runPreflight = async () => {
    setStatus("Running preflight...");
    const data = await api.post("/preflight/check", {});
    setPreflight(data as PreflightState);
    setStatus("Preflight done");
  };

  const registerPath = async () => {
    const normalizedPath = repoPath.trim();
    if (!normalizedPath) {
      setStatus("Path is required");
      return;
    }
    setStatus("Registering path...");
    await api.post("/paths/register", { integration, path: normalizedPath });
    await refreshPaths();
    setStatus("Path registered");
  };

  const registerPathAndBootstrap = async () => {
    try {
      await registerPath();
      await runBootstrap();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Register/bootstrap failed: " + msg);
    }
  };

  const loadKiploksConfig = async () => {
    if (isCsvFlow) return;
    if (!paths.some((p) => p.integration === integration)) {
      setKiploksUi(null);
      setKiploksUiBaseline(null);
      return;
    }
    try {
      const d = await api.get("/integrations/kiploks-config?integration=" + integration);
      const next = d as KiploksUiState;
      setKiploksUi(next);
      setKiploksUiBaseline(normalizeKiploksDraft(next));
    } catch (_) {
      setKiploksUi(null);
      setKiploksUiBaseline(null);
    }
  };

  const setKiploksField = (key: string, value: unknown) => {
    setKiploksUi((prev) => {
      if (!prev) return prev;
      return { ...prev, config: { ...prev.config, [key]: value } };
    });
  };

  const setKiploksApiTarget = (v: string) => {
    setKiploksUi((prev) => {
      if (!prev) return prev;
      const nextCfg = { ...prev.config };
      if (v === "local") nextCfg.api_token = "";
      return { ...prev, apiTarget: v, config: nextCfg };
    });
  };

  const saveKiploksConfig = async () => {
    if (!kiploksUi || isCsvFlow) return;
    setStatus("Saving kiploks.json...");
    const c = kiploksUi.config || {};
    const payload: Record<string, unknown> = { integration, api_target: kiploksUi.apiTarget };
    if (integration === "freqtrade") {
      payload.top_n = c.top_n;
      payload.skip_already_uploaded = c.skip_already_uploaded;
      payload.wfaPeriods = c.wfaPeriods;
      payload.wfaISSize = c.wfaISSize;
      payload.wfaOOSSize = c.wfaOOSSize;
      payload.epochs = c.epochs;
      payload.hyperopt_loss = c.hyperopt_loss;
      payload.hyperopt_result_path = c.hyperopt_result_path;
      payload.keep_last_n_backtest_files = c.keep_last_n_backtest_files;
      if (kiploksUi.apiTarget === "cloud") payload.api_token = c.api_token || "";
    } else {
      payload.backtesting_path = c.backtesting_path;
      payload.top_n = c.top_n;
      payload.wfaPeriods = c.wfaPeriods;
      payload.primary_run_id = c.primary_run_id;
      payload.wfaISSize = c.wfaISSize;
      payload.wfaOOSSize = c.wfaOOSSize;
      payload.skip_already_uploaded = c.skip_already_uploaded;
      if (kiploksUi.apiTarget === "cloud") payload.api_token = c.api_token || "";
    }
    await api.post("/integrations/kiploks-config", payload);
    await loadKiploksConfig();
    setStatus("kiploks.json saved");
  };

  const pickPath = async () => {
    setStatus("Opening folder picker...");
    const data = (await api.post("/system/select-directory", {})) as { path?: string };
    if (data?.path) {
      setRepoPath(data.path);
      setStatus("Folder selected");
    } else {
      setStatus("Folder selection cancelled");
    }
  };

  const removePath = async (name: string) => {
    setStatus("Removing path...");
    await api.del("/paths/" + name);
    await refreshPaths();
    if (name === integration) {
      setRepoPath("");
    }
    setStatus("Path removed");
  };

  const runCsv = async () => {
    setStatus("Submitting csv job...");
    const data = (await api.post("/csv/analyze", { csv: csvText, mapping: { profit: "profit" } })) as { id?: string };
    await refreshJobs();
    if (data.id) setSelectedJobId(data.id);
    setStatus("CSV job created");
  };

  const runBootstrap = async () => {
    setStatus("Submitting bootstrap job...");
    try {
      const data = (await api.post("/integrations/bootstrap", { integration, mode: bootstrapMode })) as { id?: string };
      await refreshJobs();
      if (data.id) setSelectedJobId(data.id);
      await loadKiploksConfig();
      setStatus(data.id ? `Bootstrap job created (${data.id}). Status updates every few seconds below.` : "Bootstrap request sent.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Bootstrap failed: " + msg);
    }
  };

  const runIntegration = async () => {
    setStatus("Submitting integration run...");
    try {
      const data = (await api.post("/integrations/run", {
        integration,
        mode: runMode,
        selectedArtifactKeys: selectedBacktestArtifactKey ? [selectedBacktestArtifactKey] : undefined,
      })) as unknown;
      const errorText = extractApiErrorMessage(data);
      const hasId = !!(
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof (data as { id?: unknown }).id === "string" &&
        String((data as { id: string }).id).trim()
      );
      if (!hasId && errorText) {
        setStatus("Integration run rejected: " + errorText);
        return;
      }
      await refreshJobs();
      await refreshReports();
      if (hasId) setSelectedJobId(String((data as { id: string }).id));
      setStatus("Integration run started");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Integration run failed: " + msg);
    }
  };

  const runIntegrationUploadOnly = async () => {
    setStatus("Submitting integration upload-only run...");
    try {
      const data = (await api.post("/integrations/run", {
        integration,
        mode: runMode,
        extraArgs: ["--upload-only"],
      })) as unknown;
      const errorText = extractApiErrorMessage(data);
      const hasId = !!(
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof (data as { id?: unknown }).id === "string" &&
        String((data as { id: string }).id).trim()
      );
      if (!hasId && errorText) {
        setStatus("Upload-only run rejected: " + errorText);
        return;
      }
      await refreshJobs();
      await refreshReports();
      if (hasId) setSelectedJobId(String((data as { id: string }).id));
      setStatus("Upload-only run started");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Upload-only run failed: " + msg);
    }
  };

  const runIntegrationConnectivityCheck = async () => {
    setStatus("Submitting upload connectivity check...");
    try {
      const data = (await api.post("/integrations/run", {
        integration,
        mode: runMode,
        extraArgs: ["--connectivity-check"],
      })) as unknown;
      const errorText = extractApiErrorMessage(data);
      const hasId = !!(
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof (data as { id?: unknown }).id === "string" &&
        String((data as { id: string }).id).trim()
      );
      if (!hasId && errorText) {
        setStatus("Connectivity check rejected: " + errorText);
        return;
      }
      await refreshJobs();
      if (hasId) setSelectedJobId(String((data as { id: string }).id));
      setStatus("Connectivity check started");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Connectivity check failed: " + msg);
    }
  };

  const resetConfig = async () => {
    setStatus("Resetting config...");
    await api.post("/integrations/config/reset-defaults", { integration });
    await loadKiploksConfig();
    setStatus("Config reset");
  };

  const cancelJob = async (jobId?: string) => {
    const targetId = jobId || selectedJobId;
    if (!targetId) return;
    setStatus("Cancelling job...");
    await api.post("/jobs/" + targetId + "/cancel", {});
    await refreshJobs();
    setStatus("Cancel signal sent");
  };

  useEffect(() => {
    void refreshJobs();
    void refreshPaths();
    void refreshReports();
    void refreshCloudAnalyzeLinks();
    void refreshBacktestArtifacts();
    void api
      .get("/preflight/result")
      .then((d) => setPreflight(d as PreflightState))
      .catch(() => undefined);
    const timerJobs = setInterval(() => void refreshJobs(), 5000);
    const timerReports = shellPhase === null ? setInterval(() => void refreshReports(), 8000) : null;
    const timerCloudLinks = setInterval(() => void refreshCloudAnalyzeLinks(), 8000);
    return () => {
      clearInterval(timerJobs);
      if (timerReports != null) clearInterval(timerReports);
      clearInterval(timerCloudLinks);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load + polling only
  }, []);

  /** Shell remounts legacy on each step; refresh preflight so Run Integration gate matches Preparation. */
  useEffect(() => {
    if (isCsvFlow) return;
    if (!shellPhase || shellPhase === "repository") return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.post("/preflight/check", {});
        if (!cancelled) setPreflight(data as PreflightState);
      } catch {
        /* keep prior preflight from GET if any */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shellPhase, isCsvFlow]);

  useEffect(() => {
    const m = String(window.location.hash || "").match(/^#report=(.+)$/);
    if (m?.[1]) setSelectedReportId(decodeURIComponent(m[1]));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKFLOW_KEY, workflowType);
    } catch (_) {
      /* ignore */
    }
  }, [workflowType]);

  /** Pre-fill Repository path from GET /paths when this integration already has a saved path (shell step 3). */
  useEffect(() => {
    if (isCsvFlow) return;
    const row = paths.find((p) => p.integration === integration);
    if (!row) {
      if (paths.length === 0) return;
      setRepoPath("");
      return;
    }
    const fromServer = (row.displayPath || row.canonicalPath || "").trim();
    if (!fromServer) {
      if (paths.length === 0) return;
      setRepoPath("");
      return;
    }
    setRepoPath((prev) => {
      const prevT = prev.trim();
      if (prevT === "") return fromServer;
      const stripTrail = (s: string) => {
        const t = s.replace(/\/+$/, "");
        return t === "" ? s : t;
      };
      if (stripTrail(prevT) === stripTrail(fromServer)) return fromServer;
      return prev;
    });
  }, [paths, integration, isCsvFlow]);

  useEffect(() => {
    if (!selectedJobId) return;
    const es = new EventSource("/jobs/" + selectedJobId + "/events");
    es.addEventListener("update", () => {
      void refreshJobs();
    });
    es.addEventListener("ready", () => undefined);
    es.onerror = () => undefined;
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshJobs is stable enough for polling
  }, [selectedJobId]);

  useEffect(() => {
    if (isCsvFlow) return;
    if (integration === "freqtrade" && runMode !== "docker") setRunMode("docker");
    if (integration === "octobot" && runMode === "docker") setRunMode("host");
  }, [integration, runMode, isCsvFlow]);

  useEffect(() => {
    void loadKiploksConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCsvFlow, integration, paths]);

  useEffect(() => {
    void refreshBacktestArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCsvFlow, integration, paths]);

  useEffect(() => {
    if (isCsvFlow || integration !== "freqtrade" || !hasPathForIntegration) return;
    const id = window.setInterval(() => void refreshBacktestArtifacts({ silent: true }), 10000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCsvFlow, integration, hasPathForIntegration]);

  return {
    workflowType,
    setWorkflowType,
    paths,
    jobs,
    selectedJobId,
    setSelectedJobId,
    repoPath,
    setRepoPath,
    bootstrapMode,
    setBootstrapMode,
    runMode,
    setRunMode,
    kiploksUi,
    csvText,
    setCsvText,
    preflight,
    status,
    reports,
    cloudAnalyzeLinks,
    backtestArtifacts,
    selectedBacktestArtifactKey,
    setSelectedBacktestArtifactKey,
    backtestArtifactsLoading,
    backtestArtifactsLog,
    selectedReportId,
    setSelectedReportId,
    selectedJob,
    isCsvFlow,
    integration,
    activeIntegrationJob,
    selectedReport,
    hasPreflightOk,
    hasPathForIntegration,
    hasBootstrapDone,
    canRunIntegration,
    hasKiploksChanges,
    orchestratorLayoutStep,
    stepTitle,
    progressLine,
    runModes,
    refreshJobs,
    refreshPaths,
    refreshReports,
    refreshCloudAnalyzeLinks,
    refreshBacktestArtifacts,
    runPreflight,
    registerPath,
    registerPathAndBootstrap,
    loadKiploksConfig,
    setKiploksField,
    setKiploksApiTarget,
    saveKiploksConfig,
    pickPath,
    removePath,
    runCsv,
    runBootstrap,
    runIntegration,
    runIntegrationUploadOnly,
    runIntegrationConnectivityCheck,
    resetConfig,
    cancelJob,
  };
}

export type OrchestratorAppContext = ReturnType<typeof useOrchestratorApp>;
