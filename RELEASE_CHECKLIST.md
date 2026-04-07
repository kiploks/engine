# Release checklist (`@kiploks/engine-*`)

Use this before tagging a release or publishing to npm. It keeps packages, tests, and **docs** aligned.

## 1. Automated checks (required)

From the **engine repository root**:

```bash
npm install
npm run build
npm run engine:validate
```

`engine:validate` runs lint, Vitest, boundary import check, and bundle safety checks.

## 2. Documentation accuracy (required before first release and after contract changes)

Goal: JSON and descriptions in **`docs/ENTRYPOINTS.md`** (and related guides) must match **[`packages/contracts/src`](packages/contracts/src)**.

Manual pass:

1. Open **`docs/ENTRYPOINTS.md`** minimum JSON examples.
2. Compare each example to:
   - [`packages/contracts/src/analyzeContract.ts`](packages/contracts/src/analyzeContract.ts) (`AnalyzeInput`),
   - [`packages/contracts/src/wfaAnalysisContract.ts`](packages/contracts/src/wfaAnalysisContract.ts) (`TradeBasedWFAInput`, `PrecomputedWFAInput`, `WFAWindow`).
3. If you changed any public type or exported function, re-scan **[`docs/README.md`](docs/README.md)** links and **[`CHANGELOG.md`](CHANGELOG.md)**.

There is no separate `npm test` target for “docs only”; correctness is **reviewer responsibility** until optional CI is added.

## 3. Version and publish (maintainers)

See **[`docs/OSS_PUBLIC_REPO_SYNC.md`](docs/OSS_PUBLIC_REPO_SYNC.md)** and root [`VERSION`](VERSION). After bumping `VERSION`:

```bash
npm run sync-versions
```

Then merge to `main`, create an annotated tag `vX.Y.Z` matching `VERSION`, and push the tag. GitHub Actions **release.yml** publishes to npm (Trusted Publishing).

## 4. Optional follow-ups

- Add CI that fails when markdown references removed types (future).
- Regenerate `docs/examples/sample-output/` if needed: `npm run engine:examples:generate-samples`.
