import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// Every browser run uses a new local database, including on developer machines.
// No deployment config, real database, or developer credential file is changed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const port = Number(process.env.ANACODE_E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("ANACODE_E2E_PORT must be a valid local port.");

await mkdir(resolve(root, ".wrangler/e2e"), { recursive: true });
const runDirectory = await mkdtemp(resolve(root, ".wrangler/e2e/run-"));
const configPath = resolve(runDirectory, "wrangler.json");
const persistPath = resolve(runDirectory, "state");
const hmacSecret = randomBytes(32).toString("hex");
await writeFile(configPath, JSON.stringify({
  name: "anacode-local-e2e",
  main: resolve(root, "worker/index.ts"),
  compatibility_date: "2026-08-29",
  compatibility_flags: ["nodejs_compat"],
  assets: { binding: "ASSETS", run_worker_first: ["/circuitjs/*"] },
  d1_databases: [{
    binding: "DB",
    database_name: "anacode-local-e2e",
    database_id: randomUUID(),
    migrations_dir: resolve(root, "drizzle"),
  }],
}), "utf8");
// A credential file beside the isolated config prevents loading the project's
// .dev.vars. Its only value is a fresh throwaway key for the actual rate limiter.
await writeFile(resolve(runDirectory, ".dev.vars"), `RATE_LIMIT_HMAC_SECRET=${hmacSecret}\n`, { mode: 0o600 });

for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "RATE_LIMIT_HMAC_SECRET", "CLOUDFLARE_ENV"]) {
  delete process.env[name];
}
Object.assign(process.env, {
  ANACODE_E2E_CONFIG: configPath,
  ANACODE_E2E_STATE: persistPath,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: resolve(runDirectory, "logs"),
  MINIFLARE_REGISTRY_PATH: resolve(runDirectory, "registry"),
});

try {
  await promisify(execFile)(process.execPath, [
    resolve(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "migrations", "apply", "anacode-local-e2e",
    "--config", configPath,
    "--local", "--persist-to", persistPath,
  ], { cwd: root, env: process.env, timeout: 90_000, maxBuffer: 1024 * 1024 });
} catch (error) {
  // Do not print the inherited environment or transient test credential.
  throw new Error(`Unable to initialize the isolated local E2E database. ${error.stderr || error.message}`, { cause: error });
}
console.log("E2E database initialized locally; starting the browser test server.");

const { createServer } = await import("vite");
const server = await createServer({
  root,
  mode: "e2e",
  server: { host: "localhost", port, strictPort: true },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => { await server.close(); process.exit(0); });
}
await server.listen();
server.printUrls();
