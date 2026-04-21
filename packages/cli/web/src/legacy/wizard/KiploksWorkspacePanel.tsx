import {useEffect, useMemo, useState} from "react";
import {usePrevious} from "@dedalik/use-react";
import {useOrchestratorShellPhase} from "../../shell/orchestratorShellBridge";
import type {OrchestratorAppContext} from "./useOrchestratorApp";
import {oc} from "./orchestratorUi";

type Props = { ctx: OrchestratorAppContext };

type WorkspacePanelMode = "full" | "bootstrap" | "config" | "run";
type BacktestArtifactLike = { sourceFile?: unknown; artifactKey?: unknown };

function isPositiveInt(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 1;
}

function isNonNegativeInt(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function hasText(v: unknown): boolean {
  return String(v ?? "").trim().length > 0;
}

function artifactAutoTitle(a: BacktestArtifactLike | null | undefined): string {
  const source = String(a?.sourceFile ?? "").trim();
  if (source) return source;
  const key = String(a?.artifactKey ?? "").trim();
  if (!key) return "";
  const normalized = key.replace(/\\/g, "/");
  const file = normalized.split("/").pop() || normalized;
  return file.trim();
}

function FieldStatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        (ok ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30")
      }
      title={ok ? "Field value is valid" : "Field value is invalid"}
    >
      <span aria-hidden="true">{ok ? "●" : "●"}</span>
      {ok ? "checked" : "invalid"}
    </span>
  );
}

function FieldLabelWithStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 first:mt-0">
      <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <FieldStatusBadge ok={ok} />
    </div>
  );
}

/**
 * Integration workspace: split by shell phase into bootstrap, config, and run modes.
 * Shell step 4 (workspace-activity) includes run controls plus active-job logs; full reports live on shell Step 5.
 * Standalone (no shell) uses full mode.
 */
export function KiploksWorkspacePanel({ ctx }: Props) {
  const [reportTitleDraft, setReportTitleDraft] = useState("");
  const [savingReportTitle, setSavingReportTitle] = useState(false);
  const [reportTitleTouched, setReportTitleTouched] = useState(false);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [reportRunPanelOpen, setReportRunPanelOpen] = useState(true);
  const [backtestArtifactsPanelOpen, setBacktestArtifactsPanelOpen] = useState(false);
  const shellPhase = useOrchestratorShellPhase();
  if (ctx.isCsvFlow) return null;
  if (shellPhase === null && ctx.orchestratorLayoutStep !== 4) return null;

  const mode: WorkspacePanelMode =
    shellPhase === "repository"
      ? "bootstrap"
      : shellPhase === "workspace-activity"
        ? "run"
        : shellPhase === "workspace-integration"
          ? "config"
        : "full";
  const previousSelectedBacktestArtifactKey = usePrevious(ctx.selectedBacktestArtifactKey);

  const statusBusy = /running|submitting|opening|cancelling|saving|removing|loading/i.test(ctx.status);
  const bootstrapSubmitting = /submitting bootstrap/i.test(ctx.status);
  const integrationSubmitting = /submitting integration/i.test(ctx.status);
  const latestReport = ctx.reports[0] || null;
  const generatedReportTitle = latestReport
    ? String(latestReport.listLabel || latestReport.strategy || latestReport.symbol || latestReport.id || "").trim()
    : "";

  useEffect(() => {
    const currentCustom = String(latestReport?.reportName || "").trim();
    setReportTitleDraft(currentCustom || generatedReportTitle);
    setReportTitleTouched(false);
  }, [latestReport?.id, latestReport?.reportName, latestReport?.listLabel, latestReport?.strategy, latestReport?.symbol, generatedReportTitle]);

  useEffect(() => {
    if (!latestReport) return;
    if (!reportTitleTouched) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const nextTitle = reportTitleDraft.trim();
      const currentCustom = String(latestReport.reportName || "").trim();
      const generated = generatedReportTitle;
      // No custom title yet: keep generated value as default without persisting it.
      if (!currentCustom && (nextTitle === "" || nextTitle === generated)) return;
      // Custom title exists and equals draft: nothing to save.
      if (currentCustom && nextTitle === currentCustom) return;
      const nextPersistedTitle = !currentCustom && nextTitle !== generated ? nextTitle : nextTitle;
      const payloadTitle = currentCustom && (nextTitle === "" || nextTitle === generated) ? null : (nextPersistedTitle || null);
      const save = async () => {
        setSavingReportTitle(true);
        try {
          await fetch(`/api/reports/${encodeURIComponent(latestReport.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportName: payloadTitle }),
          });
          await ctx.refreshReports();
          if (!cancelled) setReportTitleTouched(false);
        } finally {
          if (!cancelled) setSavingReportTitle(false);
        }
      };
      void save();
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [latestReport?.id, latestReport?.reportName, reportTitleDraft, generatedReportTitle, reportTitleTouched]);

  useEffect(() => {
    if (ctx.integration !== "freqtrade") return;
    const selectedKey = String(ctx.selectedBacktestArtifactKey || "").trim();
    const previousKey = String(previousSelectedBacktestArtifactKey || "").trim();
    if (!selectedKey) {
      if (!previousKey) return;
      if (String(reportTitleDraft || "").trim() === "") return;
      setReportTitleDraft("");
      setReportTitleTouched(true);
      return;
    }
    const selectedArtifact = ctx.backtestArtifacts.find((a) => String(a.artifactKey || "").trim() === selectedKey);
    const nextTitle = artifactAutoTitle(selectedArtifact);
    if (!nextTitle) return;
    const previousArtifact = previousKey
      ? ctx.backtestArtifacts.find((a) => String(a.artifactKey || "").trim() === previousKey)
      : null;
    const previousAutoTitle = artifactAutoTitle(previousArtifact);
    const currentTitle = String(reportTitleDraft || "").trim();
    const canReplace = currentTitle === "" || (previousAutoTitle !== "" && currentTitle === previousAutoTitle);
    if (!canReplace || currentTitle === nextTitle) return;
    setReportTitleDraft(nextTitle);
    setReportTitleTouched(true);
  }, [ctx.integration, ctx.selectedBacktestArtifactKey, ctx.backtestArtifacts, previousSelectedBacktestArtifactKey, reportTitleDraft]);

  const cloudTokenMissing =
    ctx.kiploksUi?.apiTarget === "cloud" && String(ctx.kiploksUi?.config?.api_token ?? "").trim() === "";
  const cfg = ctx.kiploksUi?.config ?? {};
  const fieldValid = {
    apiToken: ctx.kiploksUi?.apiTarget === "cloud" ? hasText(cfg.api_token) : true,
    topN: isPositiveInt(cfg.top_n),
    skipAlreadyUploaded: typeof cfg.skip_already_uploaded === "boolean",
    wfaPeriods: isPositiveInt(cfg.wfaPeriods),
    epochs: isPositiveInt(cfg.epochs),
    wfaISSize: isPositiveInt(cfg.wfaISSize),
    wfaOOSSize: isPositiveInt(cfg.wfaOOSSize),
    hyperoptLoss: hasText(cfg.hyperopt_loss),
    hyperoptResultPath: true,
    keepLastBacktests: isNonNegativeInt(cfg.keep_last_n_backtest_files),
    backtestingPath: hasText(cfg.backtesting_path),
    primaryRunId: hasText(cfg.primary_run_id),
  };

  const integrationBlockers = (() => {
    if (ctx.canRunIntegration) return [] as string[];
    const lines: string[] = [];
    if (!ctx.hasPreflightOk) {
      lines.push("Preflight (Python, Docker, Node) must be OK. It reloads automatically when you open this step.");
    }
    if (!ctx.hasPathForIntegration) {
      lines.push("Register a repository path on Step 3 (Repository & Bootstrap).");
    }
    if (!ctx.hasBootstrapDone) {
      lines.push("Run Bootstrap on Step 3 and wait until the job status is succeeded.");
    }
    return lines;
  })();

  const integrationActivityPanel =
    (mode === "run" || mode === "full") && ctx.hasPathForIntegration ? (
      <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
        <p className={"mt-1 text-sm font-medium " + (statusBusy ? oc.statusBusy : oc.statusReady)}>{ctx.status}</p>
        {integrationBlockers.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-300/90">
            {integrationBlockers.map((b) => (
              <li key={b} className="break-words">
                {b}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null;

  const latestBootstrapJob = useMemo(() => {
    return (
      ctx.jobs.find(
        (j) => j.type === "integration_bootstrap" && j.result && (j.result as { integration?: string }).integration === ctx.integration,
      ) ?? null
    );
  }, [ctx.jobs, ctx.integration]);

  const jobStatusClass =
    latestBootstrapJob?.status === "succeeded"
      ? "text-emerald-400"
      : latestBootstrapJob?.status === "failed"
        ? "text-rose-400"
        : "text-amber-300";

  const bootstrapActivityPanel =
    mode === "bootstrap" && ctx.hasPathForIntegration ? (
      <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
        <p className={"mt-1 text-sm font-medium " + (statusBusy ? oc.statusBusy : oc.statusReady)}>{ctx.status}</p>
        {latestBootstrapJob ? (
          <div className="mt-2 space-y-1">
            <p className={"break-all font-mono text-xs leading-relaxed " + jobStatusClass}>
              Latest bootstrap job: {latestBootstrapJob.id} · {latestBootstrapJob.status}
            </p>
            {(latestBootstrapJob.logs || []).length > 0 ? (
              <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                {(latestBootstrapJob.logs || []).slice(-4).join("\n")}
              </pre>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No bootstrap job for this integration yet. Run Bootstrap to create one.</p>
        )}
      </div>
    ) : null;

  const bootstrapFields = (
    <>
      <label className={oc.fieldLabel}>Bootstrap mode</label>
      <select className={oc.select} value={ctx.bootstrapMode} onChange={(e) => ctx.setBootstrapMode(e.target.value)}>
        <option value="safe-merge">safe-merge</option>
        <option value="replace-managed">replace-managed</option>
      </select>
      <div className={oc.row}>
        <button
          type="button"
          className={oc.btnPrimary}
          disabled={bootstrapSubmitting}
          onClick={() => void ctx.runBootstrap()}
        >
          {bootstrapSubmitting ? "Submitting..." : "Run Bootstrap"}
        </button>
      </div>
      {bootstrapActivityPanel}
    </>
  );

  const reportTitleAndRunModeFields = (
    <>
      <div className="mt-2 flex items-end gap-3">
        <label className="flex min-w-0 basis-1/2 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Report title</span>
          <input
            className={oc.input}
            value={reportTitleDraft}
            onChange={(e) => {
              setReportTitleDraft(e.target.value);
              setReportTitleTouched(true);
            }}
            placeholder={latestReport ? "Optional custom report title" : "Type title; save after a report appears"}
          />
        </label>
        <label className="flex min-w-0 basis-1/2 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run mode</span>
          <select className={oc.select} value={ctx.runMode} onChange={(e) => ctx.setRunMode(e.target.value)}>
            {ctx.runModes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      {savingReportTitle ? <p className="mt-1 text-xs font-medium text-muted-foreground">Saving title...</p> : null}
    </>
  );

  const runIntegrationFields = (
    <>
      {mode === "run" ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
          <button
            type="button"
            className={
              "flex w-full cursor-pointer select-none items-center justify-between rounded-md px-1 py-1 text-left font-medium text-foreground/85 " +
              (reportRunPanelOpen
                ? "border border-transparent ring-0 bg-transparent hover:bg-muted/40 hover:text-foreground"
                : "border border-primary/60 ring-1 ring-primary/60 bg-transparent hover:bg-muted/40 hover:text-foreground") +
              " focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
            }
            onClick={() => setReportRunPanelOpen((v) => !v)}
            aria-expanded={reportRunPanelOpen}
          >
            <span>Report title and run mode</span>
            <span className={"transition-transform duration-200 " + (reportRunPanelOpen ? "rotate-180" : "")}>▾</span>
          </button>
          <div
            className={
              "overflow-hidden transition-all duration-300 ease-in-out " +
              (reportRunPanelOpen
                ? "mt-3 max-h-[480px] border-t border-border/40 pt-3 opacity-100"
                : "max-h-0 pt-0 opacity-0")
            }
          >
            {reportTitleAndRunModeFields}
          </div>
        </div>
      ) : (
        reportTitleAndRunModeFields
      )}
      {mode === "run" || mode === "full" ? integrationActivityPanel : null}
      {ctx.hasKiploksChanges ? (
        <p className="mt-1 text-xs leading-relaxed text-amber-300/90">
          You have unsaved kiploks.json changes. Save config first, then run integration.
        </p>
      ) : null}
      {cloudTokenMissing ? (
        <p className="mt-1 text-xs leading-relaxed text-amber-300/90">
          Cloud target is selected, but api_token is empty. Fill API key in kiploks.json settings before Run Integration.
        </p>
      ) : null}
      {(() => {
        const runBusy = ctx.activeIntegrationJob?.status === "queued" || ctx.activeIntegrationJob?.status === "running";
        return runBusy ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Integration run is in progress. Wait until it finishes before starting another run.
          </p>
        ) : null;
      })()}
      <div className={oc.row}>
        <button
          type="button"
          className="inline-flex h-9 w-[150px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void ctx.runIntegration()}
          disabled={
            !ctx.canRunIntegration ||
            ctx.hasKiploksChanges ||
            cloudTokenMissing ||
            integrationSubmitting ||
            ctx.activeIntegrationJob?.status === "queued" ||
            ctx.activeIntegrationJob?.status === "running"
          }
        >
          {integrationSubmitting ? "Submitting..." : "Run Integration"}
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-[150px] items-center justify-center rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void ctx.runIntegrationConnectivityCheck()}
          disabled={
            !ctx.hasPathForIntegration ||
            cloudTokenMissing ||
            integrationSubmitting ||
            ctx.activeIntegrationJob?.status === "queued" ||
            ctx.activeIntegrationJob?.status === "running"
          }
          title="Fast check from Docker context: verifies api_url + api_token against /api/integration/analyze-status"
        >
          Check upload
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-[150px] items-center justify-center rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void ctx.runIntegrationUploadOnly()}
          disabled={
            !ctx.hasPathForIntegration ||
            cloudTokenMissing ||
            integrationSubmitting ||
            ctx.activeIntegrationJob?.status === "queued" ||
            ctx.activeIntegrationJob?.status === "running"
          }
          title="Skip WFA/backtest and upload the last exported payload from kiploks-freqtrade/export_test_result.json"
        >
          Upload only
        </button>
      </div>
    </>
  );

  const kiploksBody = (
    <>
      {!ctx.hasPathForIntegration ? (
        <p className="mt-3 text-sm text-muted-foreground">Register a repository path for this integration to load and edit kiploks.json.</p>
      ) : null}
      {ctx.hasPathForIntegration && !ctx.kiploksUi ? <p className="mt-3 text-sm text-muted-foreground">Loading kiploks.json...</p> : null}

      {ctx.hasPathForIntegration && ctx.kiploksUi ? (
        <>
          <label className={oc.fieldLabel}>API target</label>
          <select
            className={oc.select}
            value={ctx.kiploksUi.apiTarget}
            onChange={(e) => ctx.setKiploksApiTarget(e.target.value)}
          >
            <option value="local">
              Local (UI {String(ctx.kiploksUi.localApiBaseUrl || "")} · Docker {String(ctx.kiploksUi.localApiDockerBaseUrl || "")})
            </option>
            <option value="cloud">https://kiploks.com/</option>
          </select>
          {ctx.kiploksUi.apiTarget === "local" ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Open the UI in the browser at {String(ctx.kiploksUi.localApiBaseUrl || "")}/ui/ . When you save, api_url is set to{" "}
              {String(ctx.kiploksUi.localApiDockerBaseUrl || "")} so jobs inside Docker can reach this orchestrator; api_token is
              injected automatically.
            </p>
          ) : null}
          {ctx.kiploksUi.apiTarget === "cloud" ? (
            <>
              <FieldLabelWithStatus label="api_token" ok={fieldValid.apiToken} />
              <input
                className={oc.input}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={String(ctx.kiploksUi.config.api_token ?? "")}
                onChange={(e) => ctx.setKiploksField("api_token", e.target.value)}
                placeholder="Paste key from kiploks.com"
              />
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                If the key is already in kiploks.json, leave this blank to keep it, or paste to replace. Save must run before Run Integration
                (Docker) reads the file.
              </p>
            </>
          ) : null}

          {ctx.integration === "freqtrade" ? (
            <div className="mt-3 space-y-4">
              <div className="mt-3 flex items-end gap-3">
                <div className="min-w-0 basis-1/2">
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 first:mt-0">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">top_n</label>
                  </div>
                  <input
                    className={oc.input}
                    type="number"
                    min={1}
                    value={ctx.kiploksUi.config.top_n == null ? "" : String(ctx.kiploksUi.config.top_n)}
                    onChange={(e) => ctx.setKiploksField("top_n", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div className="min-w-0 basis-1/2">
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 first:mt-0">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">skip_already_uploaded</label>
                  </div>
                  <label className={oc.input + " flex items-center gap-2 text-muted-foreground"}>
                    <input
                      className={oc.checkInput}
                      type="checkbox"
                      checked={!!ctx.kiploksUi.config.skip_already_uploaded}
                      onChange={(e) => ctx.setKiploksField("skip_already_uploaded", e.target.checked)}
                    />
                    enabled
                  </label>
                </div>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Each rank creates a separate row in Reports (verdict in the list). Use 1 for one row per integration run.
              </p>
              <div className="rounded-lg border border-border bg-muted/15 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">WFA window setup</p>
                <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <div>
                    <FieldLabelWithStatus label="wfaPeriods" ok={fieldValid.wfaPeriods} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaPeriods == null ? "" : String(ctx.kiploksUi.config.wfaPeriods)}
                      onChange={(e) => ctx.setKiploksField("wfaPeriods", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <FieldLabelWithStatus label="epochs" ok={fieldValid.epochs} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.epochs == null ? "" : String(ctx.kiploksUi.config.epochs)}
                      onChange={(e) => ctx.setKiploksField("epochs", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <FieldLabelWithStatus label="wfaISSize" ok={fieldValid.wfaISSize} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaISSize == null ? "" : String(ctx.kiploksUi.config.wfaISSize)}
                      onChange={(e) => ctx.setKiploksField("wfaISSize", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <FieldLabelWithStatus label="wfaOOSSize" ok={fieldValid.wfaOOSSize} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaOOSSize == null ? "" : String(ctx.kiploksUi.config.wfaOOSSize)}
                      onChange={(e) => ctx.setKiploksField("wfaOOSSize", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <FieldLabelWithStatus label="hyperopt_loss" ok={fieldValid.hyperoptLoss} />
              <input
                className={oc.input}
                value={String(ctx.kiploksUi.config.hyperopt_loss ?? "")}
                onChange={(e) => ctx.setKiploksField("hyperopt_loss", e.target.value)}
              />
              <div className="mt-3 flex items-end gap-3">
                <div className="min-w-0 basis-1/2">
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 first:mt-0">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">hyperopt_result_path</label>
                    <FieldStatusBadge ok={fieldValid.hyperoptResultPath} />
                  </div>
                  <input
                    className={oc.input}
                    value={String(ctx.kiploksUi.config.hyperopt_result_path ?? "")}
                    onChange={(e) => ctx.setKiploksField("hyperopt_result_path", e.target.value)}
                    placeholder="optional path"
                  />
                </div>
                <div className="min-w-0 basis-1/2">
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 first:mt-0">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      keep_last_n_backtest_files
                    </label>
                    <FieldStatusBadge ok={fieldValid.keepLastBacktests} />
                  </div>
                  <input
                    className={oc.input}
                    type="number"
                    min={0}
                    value={ctx.kiploksUi.config.keep_last_n_backtest_files == null ? "" : String(ctx.kiploksUi.config.keep_last_n_backtest_files)}
                    onChange={(e) =>
                      ctx.setKiploksField("keep_last_n_backtest_files", e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {ctx.integration === "octobot" ? (
            <div className="mt-3 space-y-4">
              <FieldLabelWithStatus label="backtesting_path" ok={fieldValid.backtestingPath} />
              <input
                className={oc.input}
                value={String(ctx.kiploksUi.config.backtesting_path ?? "")}
                onChange={(e) => ctx.setKiploksField("backtesting_path", e.target.value)}
                placeholder="path under OctoBot user data"
              />
              <FieldLabelWithStatus label="top_n" ok={fieldValid.topN} />
              <input
                className={oc.input}
                type="number"
                min={1}
                value={ctx.kiploksUi.config.top_n == null ? "" : String(ctx.kiploksUi.config.top_n)}
                onChange={(e) => ctx.setKiploksField("top_n", e.target.value === "" ? "" : Number(e.target.value))}
              />
              <FieldLabelWithStatus label="primary_run_id" ok={fieldValid.primaryRunId} />
              <input
                className={oc.input}
                value={String(ctx.kiploksUi.config.primary_run_id ?? "")}
                onChange={(e) => ctx.setKiploksField("primary_run_id", e.target.value)}
              />
              <div className="rounded-lg border border-border bg-muted/15 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">WFA window setup</p>
                <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <div>
                    <FieldLabelWithStatus label="wfaPeriods" ok={fieldValid.wfaPeriods} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaPeriods == null ? "" : String(ctx.kiploksUi.config.wfaPeriods)}
                      onChange={(e) => ctx.setKiploksField("wfaPeriods", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <FieldLabelWithStatus label="wfaISSize" ok={fieldValid.wfaISSize} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaISSize == null ? "" : String(ctx.kiploksUi.config.wfaISSize)}
                      onChange={(e) => ctx.setKiploksField("wfaISSize", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <FieldLabelWithStatus label="wfaOOSSize" ok={fieldValid.wfaOOSSize} />
                    <input
                      className={oc.input}
                      type="number"
                      min={1}
                      value={ctx.kiploksUi.config.wfaOOSSize == null ? "" : String(ctx.kiploksUi.config.wfaOOSSize)}
                      onChange={(e) => ctx.setKiploksField("wfaOOSSize", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <label className={oc.checkRow}>
                <input
                  className={oc.checkInput}
                  type="checkbox"
                  checked={!!ctx.kiploksUi.config.skip_already_uploaded}
                  onChange={(e) => ctx.setKiploksField("skip_already_uploaded", e.target.checked)}
                />
                skip_already_uploaded
              </label>
            </div>
          ) : null}

          <div className="mt-4 flex flex-nowrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                void (async () => {
                  try {
                    await ctx.saveKiploksConfig();
                    setConfigPanelOpen(false);
                  } catch {
                    // Keep panel open when save fails so user can fix fields.
                  }
                })();
              }}
              disabled={!ctx.kiploksUi || !ctx.hasKiploksChanges}
            >
              Save kiploks.json
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void ctx.resetConfig()}
              disabled={!ctx.hasPathForIntegration}
            >
              Reset defaults
            </button>
          </div>
        </>
      ) : null}
    </>
  );

  if (mode === "bootstrap") {
    return (
      <section className={oc.panel}>
        <h2 className={oc.panelTitle}>Bootstrap</h2>
        <p className={oc.panelHint}>Merge or replace managed files in the integration repo after the path is registered.</p>
        {!ctx.hasPathForIntegration ? (
          <p className="mt-3 text-sm text-muted-foreground">Register a repository path on the Repository step before running bootstrap.</p>
        ) : null}
        {ctx.hasPathForIntegration ? <div className="mt-3 space-y-4">{bootstrapFields}</div> : null}
      </section>
    );
  }

  if (mode === "run") {
    return (
      <section className={oc.panel}>
        <h2 className={oc.panelTitle}>Run Integration</h2>
        <p className={oc.panelHint}>Start integration here. Active run logs are shown below.</p>
        {!ctx.hasPathForIntegration ? (
          <p className="mt-3 text-sm text-muted-foreground">Register a repository path on Step 3 before running integration.</p>
        ) : null}
        {ctx.hasPathForIntegration && ctx.integration === "freqtrade" ? (
          <div className="mt-3 rounded-lg border border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
            <button
              type="button"
              className={
                "flex w-full cursor-pointer select-none items-start justify-between gap-3 rounded-md px-1 py-1 text-left font-medium text-foreground/85 " +
                (backtestArtifactsPanelOpen
                  ? "border border-transparent ring-0 bg-transparent hover:bg-muted/40 hover:text-foreground"
                  : "border border-primary/60 ring-1 ring-primary/60 bg-transparent hover:bg-muted/40 hover:text-foreground") +
                " focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
              }
              onClick={() => setBacktestArtifactsPanelOpen((v) => !v)}
              aria-expanded={backtestArtifactsPanelOpen}
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Backtest artifact</span>
                <span className="mt-0.5 block text-xs text-muted-foreground/90">Optional fixed input for this run</span>
              </span>
              <span className={"mt-0.5 shrink-0 transition-transform duration-200 " + (backtestArtifactsPanelOpen ? "rotate-180" : "")}>▾</span>
            </button>
            <div
              className={
                "overflow-hidden transition-all duration-300 ease-in-out " +
                (backtestArtifactsPanelOpen
                  ? "mt-3 max-h-[520px] border-t border-border/40 pt-3 opacity-100"
                  : "max-h-0 pt-0 opacity-0")
              }
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">This is the full list of Freqtrade backtests. Selected item is used for the run.</p>
                <button
                  type="button"
                  className="inline-flex h-6 w-[140px] shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/40 px-2 text-center text-[11px] font-medium leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => void ctx.refreshBacktestArtifacts()}
                >
                  {ctx.backtestArtifactsLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div className="mt-2 max-h-[200px] overflow-auto rounded-md border border-border/50 bg-muted/10 p-2">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => ctx.setSelectedBacktestArtifactKey("")}
                    className={
                      "inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium transition " +
                      (ctx.selectedBacktestArtifactKey
                        ? "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                        : "border-primary/50 bg-primary/20 text-primary ring-1 ring-primary/40")
                    }
                  >
                    Auto (top_n)
                  </button>
                  {ctx.backtestArtifacts.map((a, idx) => {
                    const key = String(a.artifactKey || "");
                    const active = key !== "" && ctx.selectedBacktestArtifactKey === key;
                    const labelBase = `${a.sourceFile || "file"} ${a.startDate ? `| ${a.startDate}` : ""}`;
                    const label = labelBase.length > 56 ? labelBase.slice(0, 56) + "..." : labelBase;
                    return (
                      <button
                        key={key || `artifact-${idx}`}
                        type="button"
                        onClick={() => ctx.setSelectedBacktestArtifactKey(key)}
                        className={
                          "inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium transition " +
                          (active
                            ? "border-primary/50 bg-primary/20 text-primary ring-1 ring-primary/40"
                            : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground")
                        }
                        title={`${a.sourceFile || "file"} | ${a.strategy || "-"} | ${a.symbol || "-"} | ${a.startDate || "?"}..${a.endDate || "?"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 rounded border border-border/60 bg-muted/30 px-2 py-1.5">
                <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {ctx.backtestArtifactsLoading ? "Loading backtest artifacts..." : ctx.backtestArtifactsLog || "No logs yet."}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        {ctx.hasPathForIntegration ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
            <button
              type="button"
              className={
                "flex w-full cursor-pointer select-none items-center justify-between rounded-md px-1 py-1 font-medium text-foreground/85 " +
                (configPanelOpen
                  ? "border border-transparent ring-0 bg-transparent hover:bg-muted/40 hover:text-foreground"
                  : "border border-primary/60 ring-1 ring-primary/60 bg-transparent hover:bg-muted/40 hover:text-foreground") +
                " focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
              }
              onClick={() => setConfigPanelOpen((v) => !v)}
              aria-expanded={configPanelOpen}
            >
              <span>Edit kiploks.json (optional)</span>
              <span className={"transition-transform duration-200 " + (configPanelOpen ? "rotate-180" : "")}>▾</span>
            </button>
            <div
              className={
                "overflow-hidden transition-all duration-300 ease-in-out " +
                (configPanelOpen ? "mt-3 max-h-[2200px] border-t border-border/40 pt-3 opacity-100" : "max-h-0 pt-0 opacity-0")
              }
            >
              {kiploksBody}
            </div>
          </div>
        ) : null}
        {ctx.hasPathForIntegration ? <div className="mt-4 space-y-4">{runIntegrationFields}</div> : null}
      </section>
    );
  }

  if (mode === "config") {
    return (
      <section className={oc.panel}>
        <h2 className={oc.panelTitle}>kiploks.json ({ctx.integration})</h2>
        <p className={oc.panelHint}>Optional step: review defaults in kiploks.json before Step 5 run.</p>
        {kiploksBody}
      </section>
    );
  }

  return (
    <section className={oc.panel}>
      <h2 className={oc.panelTitle}>kiploks.json ({ctx.integration})</h2>
      <p className={oc.panelHint}>Save updates the file on disk for the selected integration.</p>
      {kiploksBody}
      {ctx.hasPathForIntegration ? (
        <div className={oc.divider + " space-y-4 pt-2"}>
          <h3 className={oc.panelSectionTitle}>Bootstrap</h3>
          {bootstrapFields}
          {runIntegrationFields}
        </div>
      ) : null}
    </section>
  );
}
