import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

/** Set by `kiploks ui --watch` so the browser can stay on the Vite origin while API calls hit the orchestrator. */
const orchestratorOrigin = process.env.KIPLOKS_ORCHESTRATOR_ORIGIN?.trim();

function orchestratorProxy() {
  if (!orchestratorOrigin) return undefined;
  const target = orchestratorOrigin;
  const rule = { target, changeOrigin: true, ws: true };
  return {
    "/api-info": rule,
    "/api": rule,
    "/preflight": rule,
    "/paths": rule,
    "/csv": rule,
    "/integrations": rule,
    "/jobs": rule,
    "/system": rule,
  };
}

const devProxy = orchestratorProxy();

export default defineConfig({
  root: dir,
  base: "/ui/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.KIPLOKS_UI_VITE_PORT || 3300),
    strictPort: false,
    ...(devProxy ? { proxy: devProxy } : {}),
  },
  build: {
    outDir: resolve(dir, "../dist/web"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
