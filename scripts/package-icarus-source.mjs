// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const build = resolve('.tmp/icarus-build'), release = resolve('.tmp/icarus-release/icarus');
const inputs = JSON.parse(readFileSync('scripts/icarus-build-inputs.json', 'utf8'));
mkdirSync(release, { recursive: true }); mkdirSync(join(release, 'source'), { recursive: true });
for (const name of ['ivlpp', 'ivl', 'vvp']) for (const extension of ['js', 'wasm']) {
  const filename = `${name}.${extension}`, bytes = readFileSync(join(build, 'output', filename));
  if (extension === 'wasm') assert.equal(bytes.subarray(0, 4).toString('hex'), '0061736d');
  copyFileSync(join(build, 'output', filename), join(release, filename));
}
for (const file of ['emscripten-version.txt', 'build-packages.txt', 'config.log', 'EMSCRIPTEN-LICENSE.txt', 'emscripten-system-licenses.tar.gz']) {
  copyFileSync(join(build, 'output', file), join(release, 'source', file));
}
copyFileSync(join(build, 'source/COPYING'), join(release, 'LICENSE'));
copyFileSync(join(build, 'upstream-source.tar.gz'), join(release, 'source/upstream-source.tar.gz'));
for (const file of ['icarus-build-inputs.json', 'prepare-icarus-source.mjs', 'patch-icarus-wasm.mjs', 'build-icarus-wasm.sh', 'package-icarus-source.mjs']) {
  copyFileSync(join('scripts', file), join(release, 'source', file));
}
writeFileSync(join(release, 'README.md'), `# Source-built Icarus Verilog for AnaCode

Icarus Verilog 14.0 (devel), Stephen Williams and contributors, is built from
https://github.com/steveicarus/iverilog/tree/${inputs.icarus.revision}.
The compiler, preprocessor and runtime are GPL-2.0-or-later; see LICENSE.
The local GPL patch statically links the upstream vvp code generator and the
system, Verilog-2005 math, SystemVerilog-2009 and Verilog-A math registration
tables. Compiler registration retains upstream system-function return types.
External VPI modules, VHDL and synthesis targets are not part of this port.

Complete original source, exact patch and build/install scripts are in source/.
The input manifest pins source SHA-256 and the Emscripten container digest.
Emscripten and linked system-library notices accompany those sources. Rebuild
using the repository workflow or the commands in docs/icarus-source-build.md.
The JavaScript wrapper is an Emscripten build output; the sole packaging edit
normalizes each adjacent WASM filename. No third-party prebuilt WASM is used.
`);
const inventory = {};
function visit(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) visit(path, name + '/');
    else inventory[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
visit(release);
writeFileSync(join(release, 'build-manifest.json'), JSON.stringify({schemaVersion: 1, engine: 'Icarus Verilog', source: inputs.icarus, buildImage: inputs.buildImage, sourceBuild: true, files: inventory}, null, 2) + '\n');
console.log(`Packaged ${Object.keys(inventory).length} runtime/source/license files with their exact hashes.`);
