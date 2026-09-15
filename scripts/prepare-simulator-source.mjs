// AnaCode source-build integration, MIT. The upstream numerical engine is unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const root = resolve('.tmp/simulator-rebuild');
const inputs = JSON.parse(readFileSync('scripts/simulator-build-inputs.json', 'utf8'));
mkdirSync(join(root, 'inputs'), { recursive: true });
const digest = (data) => createHash('sha256').update(data).digest('hex');
for (const name of ['wrapper', 'ngspice', 'bsim']) {
  const archive = join(root, 'inputs', `${name}.${name === 'bsim' ? 'tar.gz' : 'zip'}`);
  if (!existsSync(archive)) {
    const response = await fetch(inputs[name].url);
    assert.ok(response.ok, `Source download failed: ${name} (${response.status})`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(archive);
  assert.equal(digest(bytes), inputs[name].sha256, `${name}: source archive hash mismatch`);
  const destination = join(root, name === 'ngspice' ? 'native' : name);
  mkdirSync(destination, { recursive: true });
  if (name === 'bsim') execFileSync('tar', ['-xzf', archive, '-C', destination]);
  else for (const [path, data] of Object.entries(unzipSync(bytes))) {
    if (path.endsWith('/')) continue;
    const relative = path.split('/').slice(1).join('/');
    assert.ok(relative && !relative.split('/').includes('..') && !relative.startsWith('/'));
    const target = join(destination, relative); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data);
  }
}
function edit(relative, transform) {
  const path = join(root, relative), original = readFileSync(path, 'utf8'), updated = transform(original);
  assert.notEqual(updated, original, `Patch no longer applies: ${relative}`); writeFileSync(path, updated);
}
edit('native/configure.ac', (text) => text.split('\n').filter((line) => !/AC_CHECK_LIB\(stdc\+\+|AC_SUBST\(XTRALIBS|(?:src\/spicelib\/devices|tests)\/hicum2\/Makefile/.test(line)).join('\n').replaceAll('-Wno-unused-but-set-variable', '-Wno-unused-const-variable').replace('AC_CHECK_FUNCS([time getrusage])', 'AC_CHECK_FUNCS([time])'));
edit('native/src/Makefile.am', (text) => text.split('\n').filter((line) => !line.includes('spicelib/devices/hicum2/libhicum2.la')).join('\n'));
for (const path of ['native/src/spicelib/devices/Makefile.am', 'native/tests/Makefile.am']) edit(path, (text) => text.split('\n').filter((line) => !/^\s*hicum2\s*\\?\s*$/.test(line)).join('\n'));
edit('native/src/spicelib/devices/dev.c', (text) => text.split('\n').filter((line) => !line.includes('get_hicum_info')).join('\n'));
edit('native/src/frontend/control.c', (text) => {
  assert.ok(text.includes('#include "ngspice/ngspice.h"') && text.includes('freewl = wlist = getcommand(string);'));
  return text.replace('#include "ngspice/ngspice.h"', '#include <emscripten.h>\nEM_ASYNC_JS(void, eesim_sleep_hack, (), { if (Module["handleThings"]) { await new Promise((resolve) => { Module["handleThings"](); }); } });\n#include "ngspice/ngspice.h"').replace('freewl = wlist = getcommand(string);', 'eesim_sleep_hack();\n\t\tfreewl = wlist = getcommand(string);');
});
const circuits = readFileSync(join(root, 'wrapper/src/circuits.ts'), 'utf8');
const model = circuits.match(/export const strModelCMOS90 = `([\s\S]*?)`;/)?.[1];
assert.ok(model); assert.equal(digest(model), inputs.modelSha256);
const normalize = (text) => text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
const n = readFileSync(join(root, 'bsim/benchmark_test/modelcard.nmos'), 'utf8').replace('.MODEL N1 NMOS', '.MODEL N90 NMOS');
const p = readFileSync(join(root, 'bsim/benchmark_test/modelcard.pmos'), 'utf8').replace('.MODEL P1 PMOS', '.MODEL P90 PMOS').replace(/^\+VERSION\s*=\s*4\.81\s*\r?\n/m, '');
assert.deepEqual(normalize(model), normalize(n + '\n' + p), 'CMOS90 benchmark correspondence changed');
edit('wrapper/src/circuits.ts', () => '// AnaCode: retain only the BSIM4 benchmark models used by the application.\n// EEcircuit adaptations: N1/P1 renamed N90/P90; PMOS VERSION line omitted.\nexport const strModelCMOS90 = ' + JSON.stringify(model) + ';\n');
edit('wrapper/src/simulationLink.ts', (text) => text.split('\n').filter((line) => !/^import .*from "\.\/models\//.test(line)).join('\n').replace(/ {4}module\.FS\?\.writeFile\("\/modelcard\.FreePDK45"[\s\S]*? {4}\/\/ Set the handler/, '    // AnaCode: unused model libraries are excluded from this source build.\n    module.FS?.writeFile("/modelcard.CMOS90", strModelCMOS90);\n\n    // Set the handler'));
copyFileSync(join(root, 'wrapper/Docker/pre.js'), join(root, 'pre.js'));
writeFileSync(join(root, 'register.mjs'), `import { registerHooks } from 'node:module';\nregisterHooks({resolve(specifier, context, nextResolve) { if (specifier === 'eecircuit-engine') return { url: new URL('../simulator-release/vendor/eecircuit-engine/dist/eecircuit-engine.mjs', import.meta.url).href, shortCircuit: true }; return nextResolve(specifier, context); }});\n`);
console.log(`Prepared pinned ngspice and EEcircuit source; verified CMOS90 against BSIM ${inputs.bsim.version}.`);
