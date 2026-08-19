/**
 * Single version for all @kiploks/engine-* packages (Stage 3 policy).
 * Reads engine/VERSION (semver), rewrites workspace package.json files
 * and sets internal dependencies to the exact same version.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(__dirname, "..");
const VERSION_FILE = path.join(ENGINE_ROOT, "VERSION");

const PACKAGES = [
  "packages/contracts",
  "packages/core",
  "packages/adapters",
  "packages/cli",
  "packages/mcp-server",
  "packages/test-vectors",
];

function readVersion() {
  const raw = readFileSync(VERSION_FILE, "utf8").trim();
  if (!/^\d+\.\d+\.\d+/.test(raw)) {
    throw new Error(`Invalid VERSION in ${VERSION_FILE}: ${JSON.stringify(raw)}`);
  }
  return raw.split("\n")[0].trim();
}

function syncOne(version, subdir) {
  const pkgPath = path.join(ENGINE_ROOT, subdir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = version;

  const deps = pkg.dependencies;
  if (deps && typeof deps === "object") {
    for (const [k, v] of Object.entries(deps)) {
      if (k.startsWith("@kiploks/engine-") && typeof v === "string") {
        deps[k] = version;
      }
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  process.stdout.write(`sync-engine-versions: ${subdir}/package.json -> ${version}\n`);
}

function syncRootPackageJson(version) {
  const rootPkgPath = path.join(ENGINE_ROOT, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
    if (pkg.version != null) {
      pkg.version = version;
      writeFileSync(rootPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      process.stdout.write(`sync-engine-versions: package.json (engine root) -> ${version}\n`);
    }
  } catch {
    // No engine-root package.json yet
  }
}

function syncContractsEngineVersionConstant(version) {
  const indexPath = path.join(ENGINE_ROOT, "packages/contracts/src/index.ts");
  const before = readFileSync(indexPath, "utf8");
  const after = before.replace(
    /export const ENGINE_VERSION = "[^"]*";/,
    `export const ENGINE_VERSION = "${version}";`,
  );
  if (before !== after) {
    writeFileSync(indexPath, after, "utf8");
    process.stdout.write(`sync-engine-versions: packages/contracts/src/index.ts ENGINE_VERSION -> ${version}\n`);
  }
}

const v = readVersion();
for (const dir of PACKAGES) {
  syncOne(v, dir);
}
syncRootPackageJson(v);
syncContractsEngineVersionConstant(v);
process.stdout.write(`sync-engine-versions: done (${v}).\n`);
