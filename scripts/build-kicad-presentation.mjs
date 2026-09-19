// SPDX-License-Identifier: GPL-2.0-or-later
// Produce palette previews from the same official artwork and display treatment
// as the live editor. The audited source and native exports stay unmodified.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, basename } from 'node:path';
import { presentationSvg } from '../public/kicad/renderer.js';

const manifest = JSON.parse(readFileSync('public/kicad/symbols.json', 'utf8'));
const target = resolve('public/kicad/presentation');
const check = process.argv.includes('--check');
if (!check) mkdirSync(target, { recursive: true });
for (const symbol of Object.values(manifest.symbols)) {
  let svg = presentationSvg(readFileSync(resolve('public', symbol.svg.slice(1)), 'utf8'), symbol);
  if (/^Device:Q_[NP]MOS$/.test(symbol.sourceId)) {
    // The palette can crop transparent margins left by shortened display leads.
    // Circuit placement continues to use the original KiCad coordinate system.
    const xs = symbol.pins.map((pin) => pin.bodyX), ys = symbol.pins.map((pin) => pin.bodyY);
    const u = symbol.unitsPerMm;
    const viewBox = [Math.min(...xs) - 0.5 * u, Math.min(...ys) - 0.5 * u,
      Math.max(...xs) - Math.min(...xs) + 2 * u, Math.max(...ys) - Math.min(...ys) + u];
    svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${viewBox.join(' ')}"`);
  }
  const path = resolve(target, basename(symbol.svg));
  if (check) assert.equal(readFileSync(path, 'utf8'), svg, `Stale KiCad palette preview: ${symbol.sourceId}. Run node scripts/build-kicad-presentation.mjs.`);
  else writeFileSync(path, svg);
}
if (check) assert.deepEqual(readdirSync(target).sort(), Object.values(manifest.symbols).map((symbol) => basename(symbol.svg)).sort());
console.log(`${check ? 'Verified' : 'Updated'} ${Object.keys(manifest.symbols).length} KiCad palette previews.`);
