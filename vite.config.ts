import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.js";
import { isAbsolute, relative, resolve } from "node:path";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  process.env.D1_DATABASE_ID ??
  "00000000-0000-4000-8000-000000000000";

const SITE_CREATOR_DATABASE_NAME =
  process.env.D1_DATABASE_NAME ?? "site-creator-d1";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  assets: { binding: "ASSETS", run_worker_first: ["/circuitjs/*"] },
  // Pin runtime semantics so a platform default change cannot silently alter
  // a release. Review and advance this date deliberately.
  compatibility_date: "2026-08-29",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: SITE_CREATOR_DATABASE_NAME,
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: "./drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command, mode }) => {
  const isE2E = mode === "e2e";
  if (isE2E && command !== "serve") throw new Error("The isolated E2E configuration is only available to the local test server.");
  const e2eConfig = process.env.ANACODE_E2E_CONFIG;
  const e2eState = process.env.ANACODE_E2E_STATE;
  if (isE2E) {
    const testRoot = resolve(".wrangler/e2e");
    for (const path of [e2eConfig, e2eState]) {
      const within = path ? relative(testRoot, resolve(path)) : "..";
      if (!within || within === ".." || within.startsWith(`..\\`) || within.startsWith("../") || isAbsolute(within)) {
        throw new Error("Start E2E through scripts/start-e2e-server.mjs to provision an isolated local database.");
      }
    }
  }
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // Keep client boundaries visible to the RSC transform in every environment.
    // next/* resolves to Vinext shims, so excluding only "vinext" misses them.
    optimizeDeps: {
      exclude: ["lucide-react", "next/link", "next/navigation", "next/router"],
    },
    server: {
      watch: {
        ignored: ["**/build/**", "**/.tmp/**", "**/artifacts/**"],
        ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}),
      },
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        ...(isE2E ? {
          configPath: e2eConfig,
          persistState: { path: e2eState! },
          remoteBindings: false,
        } : { config: {
          ...localBindingConfig,
          ...(command === "build" ? { secrets: { required: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "RATE_LIMIT_HMAC_SECRET"] } } : {}),
        } }),
      }),
    ],
  };
});
