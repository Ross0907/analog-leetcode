import assert from "node:assert/strict";
import test from "node:test";
import { createCircuitPreset } from "../lib/circuit-presets.ts";

let cachedWorker;
async function worker() {
  if (cachedWorker) return cachedWorker;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  cachedWorker = (await import(workerUrl.href)).default;
  return cachedWorker;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the finished AnaCode landing page with security headers", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://anacode.example/", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.doesNotMatch(csp, /(?:^|;\s*)style-src\s[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /(?:^|;\s*)style-src-elem\s[^;]*'unsafe-inline'/);
  const nonce = csp.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "the HTML response must carry a per-response script nonce");
  const html = await response.text();
  assert.match(html, /<title>AnaCode — Practice electronics by designing circuits<\/title>/i);
  assert.match(html, /Learn circuit design by/);
  assert.match(html, /Specifications, not multiple choice/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  const styleTags = [...html.matchAll(/<style\b[^>]*>/gi)].map((match) => match[0]);
  assert.ok(scriptTags.length > 0, "the rendered app should include its hydration scripts");
  assert.ok(scriptTags.every((tag) => tag.includes(`nonce="${nonce}"`)), "every script must carry the CSP nonce");
  assert.ok(styleTags.every((tag) => tag.includes(`nonce="${nonce}"`)), "every inline stylesheet must carry the CSP nonce");

  const secondResponse = await app.fetch(new Request("https://anacode.example/", { headers: { accept: "text/html" } }), env, context);
  const secondNonce = secondResponse.headers.get("content-security-policy")?.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  assert.ok(secondNonce);
  assert.notEqual(secondNonce, nonce, "HTML CSP nonces must be unique per response");
});

test("renders a real challenge workspace", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://anacode.example/problems/precision-voltage-divider", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Precision voltage divider/);
  assert.match(html, /Schematic/);
  assert.match(html, /Instruments/);
  assert.match(html, /Automated checks available/);
  assert.match(html, /Components/);
});

test("grades a constrained anonymous practice submission", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://anacode.example/api/grade", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://anacode.example", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({
      problemSlug: "precision-voltage-divider",
      problemVersion: 1,
      idempotencyKey: "c886b6b0-302e-44b9-843f-ae98a272ea82",
      circuitDocument: createCircuitPreset("precision-voltage-divider"),
    }),
  }), env, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.passed, true);
  assert.equal(body.score, 100);
  assert.equal(body.persisted, false);
  assert.equal(body.graderVersion, "divider-fixed-topology-v2.0.0");
});

test("rejects cross-origin and malformed grade requests", async () => {
  const app = await worker();
  const crossOrigin = await app.fetch(new Request("https://anacode.example/api/grade", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    body: "{}",
  }), env, context);
  assert.equal(crossOrigin.status, 403);

  const malformed = await app.fetch(new Request("https://anacode.example/api/grade", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://anacode.example", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ problemSlug: "precision-voltage-divider", problemVersion: 1, idempotencyKey: "not-a-uuid", solution: { r1: -1 } }),
  }), env, context);
  assert.equal(malformed.status, 400);
});

test("trusted edge traffic fails closed when shared rate-limit configuration is unavailable", async () => {
  const app = await worker();
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...values) => logged.push(values);
  let response;
  try {
    response = await app.fetch(new Request("https://anacode.example/api/grade", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://anacode.example",
        "sec-fetch-site": "same-origin",
        "cf-connecting-ip": "203.0.113.8",
      },
      body: "{}",
    }), env, context);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(logged, [["grade rate limiter unavailable", "Error"]]);
});
