import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const requiredWorkerSecrets = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "RATE_LIMIT_HMAC_SECRET"];
const placeholderDatabaseId = "00000000-0000-4000-8000-000000000000";

/** @param {Record<string, string | undefined>} environment */
export function validateDeploymentSettings(environment) {
  const errors = [];
  if (!environment.CLOUDFLARE_API_TOKEN?.trim()) errors.push("Set the GitHub Actions secret CLOUDFLARE_API_TOKEN with Worker deployment access.");
  if (!/^[0-9a-f]{32}$/i.test(environment.CLOUDFLARE_ACCOUNT_ID ?? "")) errors.push("Set CLOUDFLARE_ACCOUNT_ID to the 32-character Cloudflare account ID.");
  const databaseId = environment.D1_DATABASE_ID ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)
    || databaseId === placeholderDatabaseId || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(databaseId)) {
    errors.push("Set the GitHub Actions variable D1_DATABASE_ID to the real database UUID; local placeholder IDs cannot be deployed.");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(environment.D1_DATABASE_NAME ?? "")) errors.push("Set the GitHub Actions variable D1_DATABASE_NAME to the existing D1 database name.");
  if (errors.length) throw new Error(errors.join("\n"));
}

/** @param {Record<string, string | undefined>} environment */
export function deploymentSecrets(environment) {
  /** @type {Record<string, string>} */
  const supplied = {};
  for (const name of requiredWorkerSecrets) {
    const value = environment[name];
    if (value?.length) supplied[name] = value;
  }
  if (supplied.SUPABASE_URL) {
    let valid = false;
    try {
      const url = new URL(supplied.SUPABASE_URL);
      valid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
        && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch { /* Report the setting name, never its value. */ }
    if (!valid) throw new Error("SUPABASE_URL must be the production project's HTTPS origin, without a path, query, or credentials.");
  }
  if (supplied.SUPABASE_PUBLISHABLE_KEY) {
    const key = supplied.SUPABASE_PUBLISHABLE_KEY;
    let valid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!valid) {
      try { valid = key.split(".").length === 3 && JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon"; }
      catch { /* Elevated or malformed keys are never printed. */ }
    }
    if (!valid) throw new Error("SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon JWT; service-role and secret keys are rejected.");
  }
  if (supplied.RATE_LIMIT_HMAC_SECRET && Buffer.byteLength(supplied.RATE_LIMIT_HMAC_SECRET, "utf8") < 32) {
    throw new Error("RATE_LIMIT_HMAC_SECRET must contain at least 32 bytes of strong random data.");
  }
  return supplied;
}

/**
 * @param {{ name?: string, d1_databases?: Array<{binding: string, database_id: string, database_name: string}>, secrets?: {required?: string[]}, assets?: {binding?: string, run_worker_first?: string[]} }} config
 * @param {Record<string, string | undefined>} environment
 */
export function validateDeploymentBundle(config, environment) {
  if (config.name !== "anacode") throw new Error("The generated Worker name must remain anacode; review any deployment target change explicitly.");
  const database = config.d1_databases?.find((binding) => binding.binding === "DB");
  if (!database || database.database_id !== environment.D1_DATABASE_ID || database.database_name !== environment.D1_DATABASE_NAME) {
    throw new Error("The generated DB binding does not match D1_DATABASE_ID and D1_DATABASE_NAME. Rebuild with the configured production variables.");
  }
  if (!requiredWorkerSecrets.every((name) => config.secrets?.required?.includes(name))) throw new Error("The generated Worker is missing its required runtime-secret declarations. Rebuild before deployment.");
  if (config.assets?.binding !== "ASSETS" || !config.assets.run_worker_first?.includes("/circuitjs/*")) throw new Error("The generated Worker is missing the CircuitJS assets and security-policy routing.");
}

async function main() {
  validateDeploymentSettings(process.env);
  if (process.argv.includes("--check-settings")) {
    console.log("Cloudflare account and D1 deployment settings are present.");
    return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const config = JSON.parse(await readFile(resolve(root, "dist/server/wrangler.json"), "utf8"));
  validateDeploymentBundle(config, process.env);
  const supplied = deploymentSecrets(process.env);
  if (!process.env.GITHUB_OUTPUT) throw new Error("This deployment preparation step must run inside GitHub Actions.");
  const directory = await mkdtemp(resolve(process.env.RUNNER_TEMP ?? tmpdir(), "anacode-deployment-"));
  const file = resolve(directory, "secrets.json");
  if (/[\r\n]/.test(file)) throw new Error("The runner temporary directory has an invalid path.");
  await writeFile(file, JSON.stringify(supplied), { mode: 0o600 });
  await appendFile(process.env.GITHUB_OUTPUT, `secrets_file=${file}\n`);
  console.log("Deployment bundle verified. Supplied runtime secrets will be uploaded atomically; existing omitted secrets are preserved.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
