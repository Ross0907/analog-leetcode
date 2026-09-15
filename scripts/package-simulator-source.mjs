// MIT integration tooling. Packages a built upstream engine and corresponding source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { build } from 'vite';

const root = resolve('.tmp/simulator-rebuild'), output = resolve('.tmp/simulator-release');
const wrapper = join(root, 'wrapper'), vendor = join(output, 'vendor/eecircuit-engine'), publicDir = join(output, 'public/simulator');
const inputs = JSON.parse(readFileSync('scripts/simulator-build-inputs.json', 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
mkdirSync(join(vendor, 'dist'), { recursive: true }); mkdirSync(publicDir, { recursive: true }); mkdirSync(join(output, 'docs'), { recursive: true });
await build({ configFile: false, root: wrapper, build: { lib: { entry: join(wrapper, 'src/main.ts'), formats: ['es'], fileName: () => 'eecircuit-engine.mjs' }, outDir: join(vendor, 'dist'), emptyOutDir: true, minify: true } });
copyFileSync(join(wrapper, 'LICENSE'), join(vendor, 'LICENSE'));
for (const file of ['main.d.ts', 'simulationLink.d.ts', 'readOutput.d.ts']) copyFileSync(resolve('node_modules/eecircuit-engine/dist', file), join(vendor, 'dist', file));
writeFileSync(join(vendor, 'package.json'), JSON.stringify({ name: 'eecircuit-engine', version: '1.8.0-anacode.1', type: 'module', description: 'EEcircuit 1.8.0 with source-built ngspice and only the verified BSIM4 benchmark models', repository: { type: 'git', url: 'https://github.com/eelab-dev/EEcircuit-engine' }, license: 'MIT', exports: { '.': { types: './dist/main.d.ts', import: './dist/eecircuit-engine.mjs' } }, module: './dist/eecircuit-engine.mjs' }, null, 2) + '\n');

copyFileSync(join(root, 'inputs/ngspice.zip'), join(publicDir, 'ngspice-source.zip'));
copyFileSync(join(root, 'inputs/bsim.tar.gz'), join(publicDir, 'bsim4-benchmark-source.tar.gz'));
copyFileSync(join(root, 'native/COPYING'), join(publicDir, 'NGSPICE-COPYING.txt'));
copyFileSync(join(wrapper, 'LICENSE'), join(publicDir, 'EECIRCUIT-LICENSE.txt'));
const bsimC = readFileSync(join(root, 'bsim/code/b4.c'), 'utf8');
const licenseEnd = bsimC.indexOf('#include');
assert.ok(licenseEnd > 0 && bsimC.slice(0, licenseEnd).includes('right to modify'));
writeFileSync(join(publicDir, 'BSIM-USE.txt'), bsimC.slice(0, licenseEnd));
for (const file of ['emscripten-version.txt', 'build-packages.txt', 'ngspice-config.log', 'EMSCRIPTEN-LICENSE.txt', 'emscripten-system-licenses.tar.gz']) copyFileSync(join(root, file), join(publicDir, file));
const sourceFiles = ['src/main.ts', 'src/readOutput.ts', 'src/simulationLink.ts', 'src/circuits.ts', 'src/spice.d.ts', 'LICENSE'];
const sourceZip = Object.fromEntries(sourceFiles.map((path) => [path, new Uint8Array(readFileSync(join(wrapper, path)))]));
sourceZip['MODIFICATIONS.txt'] = strToU8('AnaCode changes to EEcircuit 1.8.0, 2026-09-16: omit unused FreePDK/PTM/SkyWater/GF180 imports and model mounts; keep only CMOS90. The CMOS90 data matches official BSIM4 4.8.1 benchmark NMOS/PMOS cards with whitespace normalization, N1/P1 renamed N90/P90 and PMOS VERSION omitted, as in the upstream wrapper. The native engine uses the upstream HICUM2 removal and async control-loop patches. Numerical algorithms are not replaced. Build scripts and the original ngspice and BSIM archives accompany this source.');
writeFileSync(join(publicDir, 'wrapper-source.zip'), zipSync(sourceZip, { level: 9 }));
const scriptFiles = ['scripts/simulator-build-inputs.json', 'scripts/prepare-simulator-source.mjs', 'scripts/build-ngspice-wasm.sh', 'scripts/package-simulator-source.mjs', '.github/workflows/build-simulator.yml', 'package.json', 'package-lock.json'];
const buildZip = Object.fromEntries(scriptFiles.map((path) => [path, new Uint8Array(readFileSync(path))]));
buildZip['REBUILD.md'] = strToU8('Build from the AnaCode source checkout using Node 24, locked npm dependencies and Docker. Run npm ci, node scripts/prepare-simulator-source.mjs, then the Docker command in .github/workflows/build-simulator.yml, then node scripts/package-simulator-source.mjs. The Docker image and all source archives are pinned in simulator-build-inputs.json. The captured package/toolchain inventory records the actual build environment. To modify/relink ngspice, modify .tmp/simulator-rebuild/native after preparation and rerun compilation and packaging. To change models or wrapper code, modify the prepared wrapper/src files and repackage. The generated module retains the public Simulation API. Source modifications for your own use and reverse engineering to debug such modifications are permitted by the included applicable licenses; AnaCode imposes no additional restriction.');
writeFileSync(join(publicDir, 'build-scripts.zip'), zipSync(buildZip, { level: 9 }));
writeFileSync(join(publicDir, 'NOTICE.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Simulator source and licenses · AnaCode</title><style>body{max-width:850px;margin:48px auto;padding:0 24px;font:16px/1.65 system-ui}a{color:#165caa}code{overflow-wrap:anywhere}</style><h1>Simulator source and licenses</h1><p>This distribution uses EEcircuit 1.8.0 by Danial Chitnis with ngspice 45.2, built from immutable source commit <code>${inputs.ngspice.revision}</code>. The upstream circuit solver is retained. AnaCode's wrapper adaptation omits unused model libraries.</p><h2>Licenses and attribution</h2><p>EEcircuit's wrapper is <a href="EECIRCUIT-LICENSE.txt">MIT licensed</a>. Ngspice includes Berkeley/other BSD code and LGPL components including KLU and numparam; its complete <a href="NGSPICE-COPYING.txt">license inventory and license texts</a> accompany this build. The University of California, Berkeley BSIM group developed the <a href="BSIM-USE.txt">BSIM4 benchmark software</a>, Copyright 2017 Regents of the University of California. Its authors and conditions are preserved in the source. The benchmark cards are illustrative and do not represent a foundry process. The generated runtime includes <a href="EMSCRIPTEN-LICENSE.txt">Emscripten</a> and <a href="emscripten-system-licenses.tar.gz">system-library license notices</a>. The software is provided without warranty.</p><h2>Corresponding source and rebuilding</h2><ul><li><a href="ngspice-source.zip">Exact ngspice source archive</a></li><li><a href="wrapper-source.zip">Corresponding modified wrapper and model source</a></li><li><a href="bsim4-benchmark-source.tar.gz">Original BSIM4 4.8.1 benchmark source</a></li><li><a href="build-scripts.zip">Build, patch and relinking scripts with locked npm inputs</a></li><li><a href="emscripten-version.txt">Compiler version</a> · <a href="build-packages.txt">Build package inventory</a> · <a href="ngspice-config.log">Configuration log</a></li></ul><p>Source is provided alongside the binary so recipients can modify and rebuild the simulator. The original source archives plus the included patch script reproduce the modified source. PTM, FreePDK, SkyWater and GF180 model libraries are not bundled in this runtime or its wrapper source.</p><p><a href="/lab">Return to circuit lab</a></p></html>`);

const { Simulation } = await import(pathToFileURL(join(vendor, 'dist/eecircuit-engine.mjs')).href);
const simulator = new Simulation(); await simulator.start();
const banner = simulator.getInitInfo(), fs = simulator.__getSpiceModuleForTests().FS;
const modelNames = fs.readdir('/').filter((name) => name.startsWith('modelcard.') || name.endsWith('.ngspice'));
assert.deepEqual(modelNames, ['modelcard.CMOS90']);
const modelBytes = fs.readFile('/modelcard.CMOS90'); assert.equal(hash(modelBytes), inputs.modelSha256);
const moduleText = readFileSync(join(vendor, 'dist/eecircuit-engine.mjs'), 'utf8');
const wasm = Buffer.from(moduleText.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/)?.[1] ?? '', 'base64');
assert.ok(wasm.length > 1_000_000); new WebAssembly.Module(wasm);
assert.equal(hash(wasm), hash(readFileSync(join(wrapper, 'src/spice.wasm'))), 'Bundled WASM differs from compiled output');
const files = {};
function inventory(directory, prefix) { for (const file of readdirSync(directory)) { const path = join(directory, file); if (statSync(path).isDirectory()) inventory(path, `${prefix}/${file}`); else { const bytes = readFileSync(path); files[`${prefix}/${file}`] = { bytes: bytes.length, sha256: hash(bytes) }; } } }
inventory(vendor, 'node_modules/eecircuit-engine'); inventory(publicDir, 'public/simulator');
const manifest = { schemaVersion: 1, auditedAt: new Date().toISOString().slice(0, 10), releaseDecision: 'source-built-pending-release-verification', package: { name: 'eecircuit-engine', version: '1.8.0-anacode.1', installSpecifier: 'file:vendor/eecircuit-engine', repository: 'https://github.com/eelab-dev/EEcircuit-engine', upstreamVersion: '1.8.0', registryGitHead: inputs.wrapper.revision }, files, embeddedWasm: { bytes: wasm.length, sha256: hash(wasm), expectedIn: ['node_modules/eecircuit-engine/dist/eecircuit-engine.mjs'], runtimeBanner: { version: banner.match(/\*\* (ngspice-\S+)/)?.[1], buildTimestamp: banner.match(/\*\* Creation Date: (.+)/)?.[1].trim() } }, embeddedModelFiles: { 'modelcard.CMOS90': { bytes: modelBytes.length, sha256: hash(modelBytes) } }, sourceTrace: { wrapperCommit: inputs.wrapper.revision, ngspiceCommit: inputs.ngspice.revision, compilerImage: inputs.buildImage, bsimArchiveSha256: inputs.bsim.sha256, workflowCommit: process.env.GITHUB_SHA ?? null, confidence: 'built-from-verified-immutable-source-inputs', pendingChecks: ['Installed package and source artifact audit', 'Production build', 'Browser worker and multi-probe regression tests'] } };
assert.ok(manifest.embeddedWasm.runtimeBanner.version && manifest.embeddedWasm.runtimeBanner.buildTimestamp);
writeFileSync(join(output, 'docs/simulator-artifact-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packaged source-built ${manifest.embeddedWasm.runtimeBanner.version}; one verified model payload; release verification still required.`);
