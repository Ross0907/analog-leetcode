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
assert.ok(["evidence-only-not-redistribution-clearance", "source-built-pending-release-verification", "source-built-with-corresponding-source"].includes(manifest.releaseDecision), "unknown simulator release decision");
if (process.argv.includes("--release")) {
  assert.equal(manifest.releaseDecision, "source-built-with-corresponding-source", "Simulator release blocked: corresponding source and final release checks are incomplete.");
  assert.deepEqual(manifest.sourceTrace.pendingChecks, [], "Simulator release verification is incomplete.");
}

const lockfile = JSON.parse(await readFile(resolve(projectRoot, "package-lock.json"), "utf8"));
const installedPackage = JSON.parse(
  await readFile(resolve(projectRoot, "node_modules/eecircuit-engine/package.json"), "utf8"),
);
const lockedPackage = lockfile.packages?.["node_modules/eecircuit-engine"];

assert.equal(lockfile.packages?.[""]?.dependencies?.[manifest.package.name], manifest.package.installSpecifier ?? manifest.package.version);
assert.equal(installedPackage.name, manifest.package.name);
assert.equal(installedPackage.version, manifest.package.version);
assert.equal(installedPackage.repository?.url, manifest.package.repository);
if (manifest.package.installSpecifier) {
  assert.equal(manifest.package.installSpecifier, "file:vendor/eecircuit-engine");
  assert.equal(lockedPackage?.link, true);
  assert.equal(lockedPackage?.resolved, "vendor/eecircuit-engine");
  assert.equal(lockfile.packages?.["vendor/eecircuit-engine"]?.version, manifest.package.version);
  assert.equal(manifest.sourceTrace.confidence, "built-from-verified-immutable-source-inputs");
  for (const sourceFile of ["ngspice-source.zip", "wrapper-source.zip", "bsim4-benchmark-source.tar.gz", "build-scripts.zip", "NGSPICE-COPYING.txt", "BSIM-USE.txt", "EECIRCUIT-LICENSE.txt", "EMSCRIPTEN-LICENSE.txt", "emscripten-system-licenses.tar.gz", "NOTICE.html"]) {
    assert.ok(manifest.files[`public/simulator/${sourceFile}`], `Missing corresponding-source release material: ${sourceFile}`);
  }
} else {
  assert.equal(lockedPackage?.version, manifest.package.version);
  assert.equal(lockedPackage?.integrity, manifest.package.npmIntegrity);
  assert.equal(manifest.releaseDecision, "evidence-only-not-redistribution-clearance");
}

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

const simulatorFs = simulator.__getSpiceModuleForTests()?.FS;
assert.ok(simulatorFs, "initialized simulator filesystem is unavailable for model verification");
const modelFiles = simulatorFs.readdir("/")
  .filter((name) => name.startsWith("modelcard.") || name.endsWith(".ngspice"))
  .sort();
assert.deepEqual(modelFiles, Object.keys(manifest.embeddedModelFiles).sort(), "embedded model inventory drifted");
for (const [name, expected] of Object.entries(manifest.embeddedModelFiles)) {
  const bytes = simulatorFs.readFile(`/${name}`);
  assert.equal(bytes.byteLength, expected.bytes, `${name}: embedded model byte length drifted`);
  assert.equal(sha256(bytes), expected.sha256, `${name}: embedded model SHA-256 drifted`);
}

simulator.setNetList("* AnaCode provenance probe\nV1 in 0 1\nR1 in 0 1k\n.op\n.end");
const result = await simulator.runSim();
assert.equal(result.numPoints, 1);
assert.match(result.header, new RegExp(manifest.embeddedWasm.runtimeBanner.version.replace("+", "\\+")));
assert.match(result.header, new RegExp(manifest.embeddedWasm.runtimeBanner.buildTimestamp));

console.log(
  `Simulator artifact verified: ${manifest.package.name}@${manifest.package.version}, `
  + `${manifest.embeddedWasm.runtimeBanner.version}, WASM ${manifest.embeddedWasm.sha256}, ${modelFiles.length} model payloads.`,
);
console.log(manifest.releaseDecision === "source-built-with-corresponding-source"
  ? "Source-built simulator and corresponding-source release materials verified."
  : "This check detects artifact drift; the final corresponding-source release gate remains open.");
