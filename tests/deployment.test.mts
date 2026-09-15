import assert from "node:assert/strict";
import test from "node:test";
import { deploymentSecrets, requiredWorkerSecrets, validateDeploymentBundle, validateDeploymentSettings } from "../scripts/prepare-deployment.mjs";

const environment = {
  CLOUDFLARE_API_TOKEN: "test-token-never-used-for-a-network-call",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  D1_DATABASE_ID: "11223344-5566-4778-8990-aabbccddeeff",
  D1_DATABASE_NAME: "anacode-production",
};
const bundle = {
  name: "anacode",
  d1_databases: [{ binding: "DB", database_id: environment.D1_DATABASE_ID, database_name: environment.D1_DATABASE_NAME }],
  secrets: { required: requiredWorkerSecrets },
  assets: { binding: "ASSETS", run_worker_first: ["/circuitjs/*"] },
};

test("deployment requires actual account and D1 settings and rejects local placeholders", () => {
  assert.doesNotThrow(() => validateDeploymentSettings(environment));
  assert.throws(() => validateDeploymentSettings({ ...environment, CLOUDFLARE_API_TOKEN: "" }), /CLOUDFLARE_API_TOKEN/);
  assert.throws(() => validateDeploymentSettings({ ...environment, CLOUDFLARE_ACCOUNT_ID: "invalid" }), /CLOUDFLARE_ACCOUNT_ID/);
  assert.throws(() => validateDeploymentSettings({ ...environment, D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000" }), /placeholder/);
  assert.throws(() => validateDeploymentSettings({ ...environment, D1_DATABASE_NAME: "" }), /D1_DATABASE_NAME/);
});

test("deployment rejects a changed Worker, stale D1 binding or missing runtime guards", () => {
  assert.doesNotThrow(() => validateDeploymentBundle(bundle, environment));
  assert.throws(() => validateDeploymentBundle({ ...bundle, name: "unreviewed-worker" }, environment), /Worker name/);
  assert.throws(() => validateDeploymentBundle(bundle, { ...environment, D1_DATABASE_NAME: "another-database" }), /DB binding/);
  assert.throws(() => validateDeploymentBundle({ ...bundle, secrets: { required: [] } }, environment), /required runtime-secret/);
  assert.throws(() => validateDeploymentBundle({ ...bundle, assets: { binding: "ASSETS" } }, environment), /CircuitJS/);
});

test("omitted deployment secrets preserve existing dashboard configuration", () => {
  assert.deepEqual(deploymentSecrets({}), {});
  assert.deepEqual(deploymentSecrets({ SUPABASE_URL: "", RATE_LIMIT_HMAC_SECRET: "" }), {});
  assert.deepEqual(deploymentSecrets({ RATE_LIMIT_HMAC_SECRET: "x".repeat(32), UNRELATED: "never uploaded" }), { RATE_LIMIT_HMAC_SECRET: "x".repeat(32) });
});

test("deployment accepts public Supabase keys and rejects elevated keys without disclosing values", () => {
  assert.deepEqual(deploymentSecrets({ SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" }), { SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" });
  const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.doesNotThrow(() => deploymentSecrets({ SUPABASE_PUBLISHABLE_KEY: jwt("anon") }));
  for (const secret of ["sb_secret_do-not-disclose", jwt("service_role")]) {
    assert.throws(() => deploymentSecrets({ SUPABASE_PUBLISHABLE_KEY: secret }), (error: Error) => error.message.includes("service-role") && !error.message.includes(secret));
  }
});

test("deployment rejects insecure project URLs and undersized grading keys", () => {
  assert.doesNotThrow(() => deploymentSecrets({ SUPABASE_URL: "https://project.supabase.co", RATE_LIMIT_HMAC_SECRET: "x".repeat(32) }));
  for (const url of ["http://project.supabase.co", "https://localhost", "https://name:password@project.supabase.co", "https://project.supabase.co/auth", "https://project.supabase.co?key=secret"]) {
    assert.throws(() => deploymentSecrets({ SUPABASE_URL: url }), /production project's HTTPS origin/);
  }
  assert.throws(() => deploymentSecrets({ RATE_LIMIT_HMAC_SECRET: "x".repeat(31) }), /at least 32 bytes/);
});
