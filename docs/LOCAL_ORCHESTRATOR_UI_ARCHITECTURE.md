# Local Orchestrator + UI Shell Architecture

This document describes a practical architecture where a local backend process orchestrates all heavy operations, and UI remains a control shell for non-technical users.

## 1. Goal and scope

Goal:
- Run a local service process from Engine-side tooling.
- Expose a simple UI for:
  - CSV upload and analysis using Engine adapters.
  - Integration bootstrap and execution for external bot repositories (`freqtrade`, `octobot`).
  - Status tracking, logs, and result download.

Scope:
- Local-first workflow for a single user machine.
- No direct browser access to arbitrary file system paths.
- All privileged operations (filesystem, process execution, env checks) go through the local orchestrator backend.

Out of scope:
- Full cloud orchestration.
- Remote multi-tenant execution.
- Browser-only direct execution of Python integrations.

## 2. Why this architecture is required

Pure browser UI cannot reliably:
- access arbitrary local directories without strict user-mediated handles;
- spawn/manage long-running local Python or Docker jobs;
- enforce robust preflight checks against local dependencies;
- provide stable retry/recovery semantics for integration execution.

Therefore, UI must be a shell, while a local backend process performs operational work.

## 3. High-level architecture

Components:
- `UI Shell` (desktop web UI): job creation, configuration editing, progress, errors, logs, results.
- `Local Orchestrator Backend` (new local process): authoritative execution layer.
- `Engine Runtime` (`@kiploks/engine-core`, `@kiploks/engine-adapters`): CSV parse + analysis.
- `Integration Runners` (`freqtrade`, `octobot` external folders): optional Python/Docker execution targets.

Flow:
1. User opens UI and configures local paths.
2. UI sends commands to local orchestrator API.
3. Orchestrator validates environment and paths.
4. Orchestrator either:
   - runs CSV analysis directly through Engine packages, or
   - prepares and launches integration run in selected external repository.
5. Orchestrator streams status/logs and stores outputs.
6. UI renders report and actionable diagnostics.

## 4. Backend responsibilities (must-have)

The local orchestrator backend is responsible for:
- local filesystem access and path validation;
- installation/bootstrap of integration helper folder into external repo path;
- default config materialization (`kiploks.json` from template);
- process execution (`python`, `docker compose`, helper scripts);
- job queue and state machine (queued/running/succeeded/failed/cancelled);
- log capture and structured error classification;
- preflight checks (toolchain, env vars, permissions, directory layout);
- safe cancellation and cleanup.

The UI must not bypass these responsibilities.

## 5. Core API surface for UI

Recommended API groups (local HTTP, loopback only):
- `POST /preflight/check` -> environment diagnostics.
- `GET /preflight/result` -> return last preflight result without re-running checks.
- `GET /paths` -> return saved integration paths and metadata.
- `POST /paths/register` -> save/validate `freqtrade` and `octobot` paths.
- `DELETE /paths/:integration` -> remove one saved integration path.
- `POST /csv/analyze` -> parse CSV and run engine analysis.
- `POST /integrations/bootstrap` -> install/update integration helper files.
- `POST /integrations/run` -> start integration job.
- `GET /jobs` -> paginated job history for UI.
- `GET /jobs/:id` -> status, step, progress.
- `GET /jobs/:id/logs` -> paginated logs (polling endpoint).
- `GET /jobs/:id/events` -> SSE stream for real-time step/progress/log updates.
- `GET /jobs/:id/result` -> analysis output / artifact metadata.
- `POST /jobs/:id/cancel` -> cooperative stop.

Security baseline:
- bind only to `127.0.0.1`;
- ephemeral local token/session for UI calls;
- strict path allowlist rooted in user-approved directories.

## 6. Data and config model

Persist locally:
- user-selected repository paths;
- default integration config snapshots;
- last successful preflight result;
- job metadata and artifacts index;
- optional command history for troubleshooting.

Configuration policy:
- never overwrite user integration config silently;
- use explicit "create default", "merge", or "replace" actions;
- keep generated config versioned with schema to support migrations.

Minimum integration config lifecycle:
- include `schema_version`, `engine_version`, `integration_type`, `last_migrated_at`;
- store source-of-truth marker (`managed_by: "kiploks-orchestrator"`).
- expose explicit API actions:
  - `POST /integrations/config/reset-defaults`
  - `POST /integrations/config/merge`
  - `POST /integrations/config/replace`

Conflict resolution policy:
- if config file changed outside UI since last orchestrator write (mtime/hash mismatch), backend returns conflict state;
- UI must present 3-way decision: keep file, apply UI draft, or merge preview;
- default is no-write until user confirms.

## 7. Discovery and startup UX (first run)

Local startup contract:
- primary command: `kiploks ui` (alias) starting local orchestrator and UI shell.
- fallback command: `kiploks serve --ui` (non-interactive environments).

Startup behavior:
- on launch, orchestrator probes preferred port (for example `:41731`);
- if occupied, tries bounded fallback range (for example `+1...+20`);
- if no free port found, exits with actionable error and occupied PID list (when available);
- optional auto-open browser on first run (`--open` default true for interactive terminals).

Shutdown behavior:
- `Ctrl+C` triggers graceful stop: reject new jobs, cancel/terminate running subprocesses, flush state;
- hard timeout fallback kills orphan child processes after grace window;
- optional background mode (`kiploks ui --daemon`) with explicit `kiploks stop`.

First-run flow:
1. Start local service and open UI.
2. Show preflight wizard (python/docker/path permissions/env).
3. Ask user to select integration repo paths.
4. Offer bootstrap dry-run before any write.
5. Allow first CSV analysis even if integrations are not configured.

## 8. Integration execution contracts (Phase 3 design anchor)

The orchestrator must treat integration execution as adapter contracts, not ad-hoc shell calls.

Freqtrade runner contract:
- command strategy:
  - default docker mode: invoke repository-provided wrapper (for example `./kiploks-freqtrade/run-in-docker.sh`);
  - fallback host mode: `python kiploks-freqtrade/run.py` (if validated by preflight).
- expected machine-readable output:
  - preferred: JSON artifact written to known output path;
  - fallback: structured stdout markers (`KIPLOKS_JOB_STATUS`, `KIPLOKS_RESULT_PATH`).
- success criteria:
  - process exit code `0`;
  - required output artifact exists and passes schema validation.
- failure criteria:
  - non-zero exit code, missing artifact, invalid artifact schema, timeout.

OctoBot runner contract:
- command strategy:
  - default host mode: `python kiploks-octobot/run.py`;
  - optional wrapper mode: `./kiploks-octobot/run.sh`.
- expected output and success/failure criteria mirror Freqtrade contract.

Mandatory backend output normalization:
- map runner-specific outputs into unified job result:
  - `raw_artifact_path`
  - `normalized_payload`
  - `analysis_summary`
  - `error_code` + `error_context` for failures

## 9. CSV analysis response contract (`POST /csv/analyze`)

The endpoint must return a stable shape for UI rendering, including partial/invalid-row handling.

Response sections:
- `meta`: file name, delimiter, total rows, parsed rows, invalid rows.
- `validation`: list of row-level issues (row index, code, message, severity).
- `analysis_blocks`: keyed block results from engine (for example summary, risk, stability, verdict).
- `warnings`: non-fatal engine or adapter warnings.
- `artifacts`: normalized JSON output path/hash for reproducibility.

Partial-result behavior:
- for large files, backend may stream progress via `GET /jobs/:id/events`;
- UI can render completed blocks incrementally when each block is marked `ready`.

Invalid CSV behavior:
- if invalid row ratio under configured threshold, proceed with partial parse and return warnings;
- if ratio above threshold or mandatory columns missing, return hard validation error with fix hints.

## 10. Integration versioning and upgrade policy

Versioning policy for integration helper folders:
- each generated helper contains manifest (for example `.kiploks-integration-manifest.json`) with:
  - `engine_version`
  - `template_version`
  - `generated_at`
  - `files_checksum`

Upgrade detection:
- on every `POST /integrations/bootstrap`, orchestrator compares manifest + checksums with current template set;
- if outdated, backend returns `upgrade_available` state and migration actions.

Upgrade strategies:
- `safe-merge` (default): patch managed files only, preserve user custom files;
- `replace-managed`: replace only files declared as managed in manifest;
- `full-reinstall`: explicit destructive action requiring user confirmation.

User visibility:
- UI shows version badge: `Installed vX / Latest vY`;
- stale integrations are flagged before run and can be blocked by policy.

## 11. Engine/CLI compatibility checks

Compatibility checks must run before bootstrap and run:
- detect local CLI version vs template compatibility matrix;
- detect engine package version expected by installed integration helper;
- warn or hard-stop on known incompatible combinations.

Minimum enforcement:
- major version mismatch => hard stop;
- minor mismatch => warning with guided upgrade;
- patch mismatch => allow by default.

## 12. Multiplatform path handling

Path normalization rules:
- normalize separators (`\` and `/`) to platform-safe internal representation;
- preserve Windows drive letters and UNC paths;
- resolve symlinks and canonical real paths before allowlist checks;
- reject path traversal attempts after normalization.

Runner portability:
- never build commands via raw string concatenation of user paths;
- pass paths as structured args to process spawn APIs;
- store both `display_path` (UI-friendly) and `canonical_path` (execution-safe).

Windows-specific checks:
- path length and reserved filename constraints;
- executable resolution for `python`/`py` and shell wrappers;
- consistent quoting rules for spaces in repository paths.

## 13. Stopper matrix (critical constraints)

### A) Hard stop (cannot proceed automatically)
- Missing Python runtime required by integration.
- Missing Docker runtime when selected execution mode requires Docker.
- Invalid selected path (not bot repo root or missing required subfolders).
- Missing mandatory auth/env required for upload/remote API steps.
- OS permission denial for writing integration files.

### B) Soft stop (can proceed with degraded mode)
- Optional Playwright/e2e checks unavailable.
- Self-signed local certificates not trusted (UI warning + fallback URL guidance).
- Partial metric payload where engine can still compute subset blocks.

### C) Known architectural limits
- No fully reliable browser-only flow for integration bootstrap/run.
- Cross-machine reproducibility is constrained by local toolchain versions.
- Long-running job reliability requires explicit restart/recovery strategy in orchestrator.

## 14. What must not be promised to users

Do not promise:
- "one-click works everywhere" without environment preparation;
- identical results across all machines with different Python/Docker/tool versions;
- fully hands-off setup for arbitrary external repositories with unknown customizations.

Must state clearly:
- first run includes local preflight and setup;
- integration execution depends on external repo health and local environment;
- UI simplifies operations but does not remove external dependency constraints.

## 15. Implementation plan (phased)

Phase 0 - Foundation:
- define job model and API contracts;
- implement preflight engine (python/docker/path/env checks);
- implement secure local server startup lifecycle.

Phase 1 - CSV-first value:
- implement `csv/analyze` pipeline with adapters;
- return structured analysis and warnings;
- add UI for upload + report rendering + diagnostics.

Phase 2 - Integration bootstrap:
- support selecting `freqtrade` / `octobot` repo paths;
- materialize integration folder and default config from templates;
- add dry-run mode to show intended filesystem changes.

Phase 3 - Integration execution:
- run integration commands via orchestrator;
- stream logs and status;
- persist artifacts and provide rerun from previous config.

Phase 4 - Hardening:
- robust cancellation/timeout policies;
- crash recovery and orphan process detection;
- reproducibility report (tool versions, command hash, config hash).

## 16. Operational guardrails

Required before each integration run:
- preflight freshness window (for example, last 24h) or force recheck;
- path integrity revalidation (repo markers);
- config schema validation;
- disk-space and write-permission checks for output directories.

Observability:
- structured logs by job step (`preflight`, `bootstrap`, `run`, `collect`, `analyze`);
- stable error codes for UI mapping;
- local diagnostic bundle export for support.

## 17. Decision summary

Is this approach feasible?
- Yes. It is the technically correct path for "simple UI over complex local integrations".

Primary risk concentration:
- local environment variability (python/docker/paths/permissions);
- external repository conventions drift (`freqtrade`, `octobot`);
- process orchestration reliability.

Risk mitigation:
- strict preflight gating;
- explicit bootstrap semantics with dry-run;
- stable job orchestration and diagnostics-first UX.

# Local Orchestrator + UI Shell Architecture

This document describes a practical architecture where a local backend process orchestrates all heavy operations, and UI remains a control shell for non-technical users.

## 1. Goal and scope

Goal:
- Run a local service process from Engine-side tooling.
- Expose a simple UI for:
  - CSV upload and analysis using Engine adapters.
  - Integration bootstrap and execution for external bot repositories (`freqtrade`, `octobot`).
  - Status tracking, logs, and result download.

Scope:
- Local-first workflow for a single user machine.
- No direct browser access to arbitrary file system paths.
- All privileged operations (filesystem, process execution, env checks) go through the local orchestrator backend.

Out of scope:
- Full cloud orchestration.
- Remote multi-tenant execution.
- Browser-only direct execution of Python integrations.

## 2. Why this architecture is required

Pure browser UI cannot reliably:
- access arbitrary local directories without strict user-mediated handles;
- spawn/manage long-running local Python or Docker jobs;
- enforce robust preflight checks against local dependencies;
- provide stable retry/recovery semantics for integration execution.

Therefore, UI must be a shell, while a local backend process performs operational work.

## 3. High-level architecture

Components:
- `UI Shell` (desktop web UI): job creation, configuration editing, progress, errors, logs, results.
- `Local Orchestrator Backend` (new local process): authoritative execution layer.
- `Engine Runtime` (`@kiploks/engine-core`, `@kiploks/engine-adapters`): CSV parse + analysis.
- `Integration Runners` (`freqtrade`, `octobot` external folders): optional Python/Docker execution targets.

Flow:
1. User opens UI and configures local paths.
2. UI sends commands to local orchestrator API.
3. Orchestrator validates environment and paths.
4. Orchestrator either:
   - runs CSV analysis directly through Engine packages, or
   - prepares and launches integration run in selected external repository.
5. Orchestrator streams status/logs and stores outputs.
6. UI renders report and actionable diagnostics.

## 4. Backend responsibilities (must-have)

The local orchestrator backend is responsible for:
- local filesystem access and path validation;
- installation/bootstrap of integration helper folder into external repo path;
- default config materialization (`kiploks.json` from template);
- process execution (`python`, `docker compose`, helper scripts);
- job queue and state machine (queued/running/succeeded/failed/cancelled);
- log capture and structured error classification;
- preflight checks (toolchain, env vars, permissions, directory layout);
- safe cancellation and cleanup.

The UI must not bypass these responsibilities.

## 5. Core API surface for UI

Recommended API groups (local HTTP, loopback only):
- `POST /preflight/check` -> environment diagnostics.
- `POST /paths/register` -> save/validate `freqtrade` and `octobot` paths.
- `POST /csv/analyze` -> parse CSV and run engine analysis.
- `POST /integrations/bootstrap` -> install/update integration helper files.
- `POST /integrations/run` -> start integration job.
- `GET /jobs/:id` -> status, step, progress.
- `GET /jobs/:id/logs` -> structured logs/stream.
- `GET /jobs/:id/result` -> analysis output / artifact metadata.
- `POST /jobs/:id/cancel` -> cooperative stop.

Security baseline:
- bind only to `127.0.0.1`;
- ephemeral local token/session for UI calls;
- strict path allowlist rooted in user-approved directories.

## 6. Data and config model

Persist locally:
- user-selected repository paths;
- default integration config snapshots;
- last successful preflight result;
- job metadata and artifacts index;
- optional command history for troubleshooting.

Configuration policy:
- never overwrite user integration config silently;
- use explicit "create default", "merge", or "replace" actions;
- keep generated config versioned with schema to support migrations.

## 7. Stopper matrix (critical constraints)

### A) Hard stop (cannot proceed automatically)
- Missing Python runtime required by integration.
- Missing Docker runtime when selected execution mode requires Docker.
- Invalid selected path (not bot repo root or missing required subfolders).
- Missing mandatory auth/env required for upload/remote API steps.
- OS permission denial for writing integration files.

### B) Soft stop (can proceed with degraded mode)
- Optional Playwright/e2e checks unavailable.
- Self-signed local certificates not trusted (UI warning + fallback URL guidance).
- Partial metric payload where engine can still compute subset blocks.

### C) Known architectural limits
- No fully reliable browser-only flow for integration bootstrap/run.
- Cross-machine reproducibility is constrained by local toolchain versions.
- Long-running job reliability requires explicit restart/recovery strategy in orchestrator.

## 8. What must not be promised to users

Do not promise:
- "one-click works everywhere" without environment preparation;
- identical results across all machines with different Python/Docker/tool versions;
- fully hands-off setup for arbitrary external repositories with unknown customizations.

Must state clearly:
- first run includes local preflight and setup;
- integration execution depends on external repo health and local environment;
- UI simplifies operations but does not remove external dependency constraints.

## 9. Implementation plan (phased)

Phase 0 - Foundation:
- define job model and API contracts;
- implement preflight engine (python/docker/path/env checks);
- implement secure local server startup lifecycle.

Phase 1 - CSV-first value:
- implement `csv/analyze` pipeline with adapters;
- return structured analysis and warnings;
- add UI for upload + report rendering + diagnostics.

Phase 2 - Integration bootstrap:
- support selecting `freqtrade` / `octobot` repo paths;
- materialize integration folder and default config from templates;
- add dry-run mode to show intended filesystem changes.

Phase 3 - Integration execution:
- run integration commands via orchestrator;
- stream logs and status;
- persist artifacts and provide rerun from previous config.

Phase 4 - Hardening:
- robust cancellation/timeout policies;
- crash recovery and orphan process detection;
- reproducibility report (tool versions, command hash, config hash).

## 10. Operational guardrails

Required before each integration run:
- preflight freshness window (for example, last 24h) or force recheck;
- path integrity revalidation (repo markers);
- config schema validation;
- disk-space and write-permission checks for output directories.

Observability:
- structured logs by job step (`preflight`, `bootstrap`, `run`, `collect`, `analyze`);
- stable error codes for UI mapping;
- local diagnostic bundle export for support.

## 11. Decision summary

Is this approach feasible?
- Yes. It is the technically correct path for "simple UI over complex local integrations".

Primary risk concentration:
- local environment variability (python/docker/paths/permissions);
- external repository conventions drift (`freqtrade`, `octobot`);
- process orchestration reliability.

Risk mitigation:
- strict preflight gating;
- explicit bootstrap semantics with dry-run;
- stable job orchestration and diagnostics-first UX.

