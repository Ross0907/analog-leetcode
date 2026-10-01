// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const inputs = JSON.parse(readFileSync('scripts/icarus-build-inputs.json', 'utf8'));
const root = resolve('.tmp/icarus-build');
mkdirSync(root, { recursive: true });
const archive = resolve(root, 'upstream-source.tar.gz');
if (!existsSync(archive)) {
  const response = await fetch(inputs.icarus.url);
  assert(response.ok, `Source download failed: ${response.status}`);
  writeFileSync(archive, new Uint8Array(await response.arrayBuffer()));
}
assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), inputs.icarus.sha256, 'Icarus source hash mismatch');
const source = resolve(root, 'source');
mkdirSync(source, { recursive: true });
execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', source], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/patch-icarus-wasm.mjs', source], { stdio: 'inherit' });
