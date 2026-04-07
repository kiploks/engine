# Open Core engine: public repository

This repository **is** the public Open Core root (npm scope `@kiploks/engine-*`). Push and tag **this** repo directly; there is no git subtree step.

## Layout (repository root)

```text
VERSION                 # single semver for all @kiploks/engine-* packages
LICENSE
README.md
CHANGELOG.md
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
vitest.config.ts
package.json            # private workspace root (not published)
scripts/                # prepack, version sync, boundary/bundle checks
packages/
  contracts/
  core/
  adapters/
  cli/
  test-vectors/
docs/                   # Open Core guides and examples (see docs/README.md)
```

## One version for all packages

- Source of truth: `VERSION` (one line, e.g. `0.1.0`).
- Run from **this** repository root:

```bash
npm run sync-versions
```

This sets every workspace `package.json` `version` and internal `@kiploks/engine-*` `dependencies` to that exact semver.

After changing `VERSION`, commit, then sync, then rebuild and run checks before publishing.

## CI and publish (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`): on every PR and push to `main` - `npm ci`, `npm run build`, `npm run engine:validate`.
- **Release** (`.github/workflows/release.yml`): on push of tag `v*` (e.g. `v0.2.0`). The `VERSION` file must equal the tag without the `v` prefix (`0.2.0`). After bumping `VERSION`, run `npm run sync-versions`, commit, merge, then create and push the tag on that commit.
- **npm:** publishing uses **Trusted Publishing** (OIDC) from this workflow file - no long-lived `NPM_TOKEN` in GitHub. Each `@kiploks/engine-*` package on npmjs.com must list this workflow under Trusted Publisher (filename must match: `release.yml`).
- Optional: create a **GitHub Release** from the tag for notes; it does not affect npm publish.
