import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('public/circuitjs');
const manifestPath = join(root, 'artifact-manifest.json');
function inventory(directory) {
  return readdirSync(directory).sort().flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return inventory(path);
    if (path === manifestPath) return [];
    const bytes = readFileSync(path);
    return [{ path: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  });
}
const files = inventory(root);
assert.ok(!files.some((file) => file.path.startsWith('WEB-INF/')), 'GWT server/debug metadata must not be publicly distributed.');
if (process.argv.includes('--record')) {
  writeFileSync(manifestPath, JSON.stringify({ project: 'CircuitJS1', repository: 'https://github.com/pfalstad/circuitjs1', revision: '5bdb1296ce6a82f79515f4f1dd1b9a86e03236f7', license: 'GPL-2.0-or-later', sourceArchiveSha256: 'd1a16f7aa89d39ece858238040b0cdf867f2058731d79e90ef13609045c971e5', build: { gwt: '2.12.2', gwtArchiveSha256: '32c17bbc8e98548c0be433aab36a3b8ba7428cfc70a26c41c4af4e0d6ecff1e1', java: 'Eclipse Adoptium OpenJDK 21.0.4+7', sourceLevel: '17', style: 'OBF', optimize: 9, localWorkers: 2, script: 'scripts/build-circuitjs.ps1' }, files }, null, 2) + '\n');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(files, manifest.files, 'CircuitJS assets changed: rebuild/review and record their manifest.');
  assert.equal(files.find((file) => file.path === 'upstream-source.zip')?.sha256, manifest.sourceArchiveSha256);
  for (const script of ['patch-circuitjs-api.mjs', 'build-circuitjs.ps1']) {
    assert.equal(readFileSync(join(root, script), 'utf8'), readFileSync(resolve('scripts', script), 'utf8'), `Distributed ${script} differs from the reviewed build input.`);
  }
  for (const required of ['COPYING.txt','GWT-COPYING.txt','NOTICE.html','patch-circuitjs-api.mjs','build-circuitjs.ps1','circuitjs1/circuitjs1.nocache.js']) assert.ok(files.some((file) => file.path === required), `Missing ${required}`);
  assert.ok(!readFileSync(join(root, 'circuitjs.html'), 'utf8').includes('serviceWorker.register'));
}
console.log(`CircuitJS1: ${files.length} local assets verified against pinned source and artifact manifest.`);
