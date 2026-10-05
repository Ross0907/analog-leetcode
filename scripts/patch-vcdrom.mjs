// MIT. Small presentation hooks against the exact published VCDrom 1.6 bundle.
// Run: node scripts/patch-vcdrom.mjs [viewer directory]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const directory=resolve(process.argv[2]??'public/hdl/viewer');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=gunzipSync(readFileSync(join(directory,'source/vcdrom-1.6.0.js.gz')));
assert.equal(hash(input),'85588198b8944e889b9ecb504f1ca8db5f1b252b1b962dc2e8f7afcd7c3b80a8','VCDrom upstream input changed');
let source=input.toString('utf8');
function replace(before,after){assert.equal(source.split(before).length,2,`Expected one hook: ${before}`);source=source.replace(before,after);}
replace('cm.view.focus()})),await getVcd', 'cm.view.focus(),global.AnacodeVcdrom?.attach({container,deso,cm})})),await getVcd');
replace('if(void 0===ref)return;const chang=desc.chango[ref]', 'if(void 0===ref||lane.anacodeAnalog)return;const chang=desc.chango[ref]');
replace('if(chango&&"vec"===chango.kind)', 'if(chango&&"vec"===chango.kind&&!lane.anacodeAnalog)');
replace('gl.uniform1f(loco.tilt,3/width)', 'gl.uniform4fv(loco.colors,globalThis.AnacodeVcdrom?.colors()||cColors),gl.uniform1f(loco.tilt,3/width)');
replace('if(mPre)return vPre?', 'if(mPre&&!fmt?.anacodeRadix)return vPre?');
replace('let txtOrig=vPre.toString(base);', 'let txtOrig=fmt?.anacodeRadix?globalThis.AnacodeVcdrom.formatValue(vPre,mPre,fmt.anacodeWidth,fmt.anacodeRadix):vPre.toString(base);');
// Zero is a real numeric bus value and must remain visible in the selected radix.
replace('if(vPre||mPre){if(xPre>width', 'if(vPre||mPre||lane.format?.anacodeRadix){if(xPre>width');
// ASCII bus contents are text, never SVG. Escape after native label truncation
// so partial entity sequences cannot alter either the title or visible label.
replace('["title",txtOrig],txtShort]', '["title",globalThis.AnacodeVcdrom?.escapeSvgText(txtOrig)??txtOrig],globalThis.AnacodeVcdrom?.escapeSvgText(txtShort)??txtShort]');
// A legal zero-duration VCD still has an operating value; do not divide by zero.
replace('deso.tgcd=tgcd,deso.t0=', 'deso.tgcd=tgcd||1,deso.t0=');
const banner='/* VCDrom 1.6.0 (MIT), WaveDrom contributors. AnaCode presentation hooks: source/patch-vcdrom.mjs. */\n';
writeFileSync(join(directory,'vcdrom.js'),banner+source);
const ownSource=readFileSync(new URL(import.meta.url));
writeFileSync(join(directory,'source/patch-vcdrom.mjs'),ownSource);
writeFileSync(join(directory,'presentation-patch.json'),JSON.stringify({upstream:'VCDrom 1.6.0',license:'MIT',input:'source/vcdrom-1.6.0.js.gz',inputSha256:hash(input),patch:'source/patch-vcdrom.mjs',patchSha256:hash(ownSource),outputSha256:hash(banner+source),changes:['Expose existing parsed lanes and native viewport to the local presentation adapter','Native digital draw skips lanes explicitly shown as analog numeric traces','Use theme palette and selected value radix in native waveform labels','Escape ASCII SVG labels after native truncation','Keep zero-duration VCD operating values finite']},null,2)+'\n');
console.log('VCDrom presentation hooks applied to the verified upstream bundle.');
