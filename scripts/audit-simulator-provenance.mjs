import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "eecircuit-engine";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(projectRoot, "docs/simulator-artifact-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractEmbeddedWasm(source, relativePath) {
  const marker = "data:application/wasm;base64,";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${relativePath}: embedded WebAssembly data URI is missing`);

  const start = markerIndex + marker.length;
  let end = start;
  while (end < source.length && /[A-Za-z0-9+/=]/.test(source[end])) end += 1;
  assert.ok(end > start, `${relativePath}: embedded WebAssembly payload is empty`);
  return Buffer.from(source.slice(start, end), "base64");
}

assert.equal(manifest.schemaVersion, 1, "unsupported simulator artifact manifest");
assert.equal(
  manifest.releaseDecision,
  "evidence-only-not-redistribution-clearance",
  "artifact verification must not be presented as redistribution clearance",
);

const lockfile = JSON.parse(await readFile(resolve(projectRoot, "package-lock.json"), "utf8"));
const installedPackage = JSON.parse(
  await readFile(resolve(projectRoot, "node_modules/eecircuit-engine/package.json"), "utf8"),
);
const lockedPackage = lockfile.packages?.["node_modules/eecircuit-engine"];

assert.equal(lockfile.packages?.[""]?.dependencies?.[manifest.package.name], manifest.package.version);
assert.equal(installedPackage.name, manifest.package.name);
assert.equal(installedPackage.version, manifest.package.version);
assert.equal(installedPackage.repository?.url, manifest.package.repository);
assert.equal(lockedPackage?.version, manifest.package.version);
assert.equal(lockedPackage?.integrity, manifest.package.npmIntegrity);

for (const [relativePath, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(resolve(projectRoot, relativePath));
  assert.equal(bytes.byteLength, expected.bytes, `${relativePath}: byte length drifted`);
  assert.equal(sha256(bytes), expected.sha256, `${relativePath}: SHA-256 drifted`);
}

for (const relativePath of manifest.embeddedWasm.expectedIn) {
  const source = await readFile(resolve(projectRoot, relativePath), "utf8");
  const wasm = extractEmbeddedWasm(source, relativePath);
  assert.equal(wasm.byteLength, manifest.embeddedWasm.bytes, `${relativePath}: WASM byte length drifted`);
  assert.equal(sha256(wasm), manifest.embeddedWasm.sha256, `${relativePath}: WASM SHA-256 drifted`);
  assert.doesNotThrow(() => new WebAssembly.Module(wasm), `${relativePath}: invalid WebAssembly module`);
}

const simulator = new Simulation();
await simulator.start();
const initializationBanner = simulator.getInitInfo();
assert.match(initializationBanner, new RegExp(manifest.embeddedWasm.runtimeBanner.version.replace("+", "\\+")));
assert.match(initializationBanner, new RegExp(manifest.embeddedWasm.runtimeBanner.buildTimestamp));

simulator.setNetList("* AnaCode provenance probe\nV1 in 0 1\nR1 in 0 1k\n.op\n.end");
const result = await simulator.runSim();
assert.equal(result.numPoints, 1);
assert.match(result.header, new RegExp(manifest.embeddedWasm.runtimeBanner.version.replace("+", "\\+")));
assert.match(result.header, new RegExp(manifest.embeddedWasm.runtimeBanner.buildTimestamp));

console.log(
  `Simulator artifact verified: ${manifest.package.name}@${manifest.package.version}, `
  + `${manifest.embeddedWasm.runtimeBanner.version}, WASM ${manifest.embeddedWasm.sha256}.`,
);
console.log("This check detects artifact drift; it does not clear the documented redistribution stop-ship gate.");
