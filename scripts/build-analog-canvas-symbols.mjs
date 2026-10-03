// SPDX-License-Identifier: AGPL-3.0-only
// Select the upstream catalog unchanged; no schematic model/parser is introduced.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { analogSvg } from '../public/analog-canvas/renderer.js';
const source = readFileSync('public/analog-canvas/source/razavi-catalog.generated.ts.txt', 'utf8');
if (createHash('sha256').update(source).digest('hex') !== '8a2aaf499ae19d33e28667951e633d36a3b765cf20974e465bce610c21985f49') throw new Error('Pinned Analog Canvas source hash changed.');
const { razaviCatalogSymbols, razaviSymbolCatalogEntries } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const revision = '85e6be67420a2395d5094325123b6debc1eb0286';
const selected = ['resistor', 'capacitor', 'inductor', 'inductor-compact', 'diode', 'zener-diode', 'battery', 'voltage-source', 'pulse-voltage-source', 'current-source', 'ground', 'npn', 'pnp', 'nmos', 'pmos', 'opamp', 'opamp-wide'];
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = { schemaVersion: 1, repository: 'https://github.com/cascode-ai/analog-canvas', revision, license: 'AGPL-3.0-only',
  sourceSha256: sha256('public/analog-canvas/source/razavi-catalog.generated.ts.txt'), licenseSha256: sha256('public/analog-canvas/LICENSE.md'),
  symbols: Object.fromEntries(selected.map((id) => [id, razaviCatalogSymbols.find((symbol) => symbol.id === id)])),
  provenance: razaviSymbolCatalogEntries.filter((entry) => selected.includes(entry.symbolId)),
};
if (Object.values(manifest.symbols).some((symbol) => !symbol)) throw new Error('Pinned Analog Canvas catalog changed.');
const check = process.argv.includes('--check');
const save = (path, content) => { if (check) { if (readFileSync(path, 'utf8') !== content) throw new Error(`Stale Analog Canvas asset: ${path}`); } else writeFileSync(path, content); };
save('public/analog-canvas/symbols.json', JSON.stringify(manifest, null, 2) + '\n');
if (!check) mkdirSync('public/analog-canvas/svg', {recursive:true});
for (const symbol of Object.values(manifest.symbols)) save(`public/analog-canvas/svg/${symbol.id}.svg`, analogSvg(symbol));
console.log(`Selected ${selected.length} unchanged Analog Canvas symbol definitions at ${revision}.`);
