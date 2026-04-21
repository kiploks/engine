/**
 * Server-side assembly API for Node.js backends and integrations (not for browser bundles).
 * Import from `@kiploks/engine-core/server` - published on npm and semver-stable as a subpath.
 * Do not import from frontend / browser bundles (use root `@kiploks/engine-core` there).
 *
 * Intentionally mirrors `internal.ts` without re-exporting `./internal`, so `prepack` can omit
 * `dist/internal.*` from the tarball while this entry remains self-contained.
 */
export * from "./decisionArtifacts";
export * from "./analyzeCardSummary";
export * from "./standalonePayloadValidation";
export * from "./buildTestResultDataFromUnified";
export * from "./riskAnalysis";
export { riskBuilderFromRCore } from "./riskCore";
export * from "./analysisReportTypes";
export * from "./summaryBlockEngine";
export * from "./whatIfScenarios";
export * from "./finalVerdictEngine";
export * from "./strategyActionPlanPrecomputed";
export * from "./integrity";
export * from "./validateReportInvariants";
export * from "./parameterSensitivity";
export * from "./proBenchmarkMetrics";
export * from "./dataQualityGuard";
