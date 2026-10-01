import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('public/hdl');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const build=JSON.parse(readFileSync(join(root,'icarus/build-manifest.json'),'utf8'));
assert.equal(build.sourceBuild,true,'The HDL release must be built from its corresponding source.');
assert.equal(build.source.revision,'c7530dbcc186de2f21eacde14fd28061b885924c');
assert.equal(hash(readFileSync(join(root,'icarus/source/upstream-source.tar.gz'))),build.source.sha256);
for(const [path,expected] of Object.entries(build.files))assert.equal(hash(readFileSync(join(root,'icarus',path))),expected,`Icarus file drift: ${path}`);
for(const name of ['prepare-icarus-source.mjs','patch-icarus-wasm.mjs','build-icarus-wasm.sh','package-icarus-source.mjs','icarus-build-inputs.json'])assert.equal(readFileSync(join(root,'icarus/source',name),'utf8').replaceAll('\r\n','\n'),readFileSync(join('scripts',name),'utf8').replaceAll('\r\n','\n'),`Rebuild after changing ${name}`);
function inventory(directory){return readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(entry=>{
  const path=join(directory,entry.name);
  if(entry.isDirectory())return inventory(path);
  if(path===join(root,'artifact-manifest.json'))return [];
  const bytes=readFileSync(path);
  assert.ok(bytes.length<25*1024*1024,`Cloudflare asset exceeds 25 MiB: ${path}`);
  return [{path:relative(root,path).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)}];
});}
const files=inventory(root);
if(process.argv.includes('--record'))writeFileSync(join(root,'artifact-manifest.json'),JSON.stringify({schemaVersion:1,engines:['Icarus Verilog','VCDrom 1.6.0'],files},null,2)+'\n');
else assert.deepEqual(files,JSON.parse(readFileSync(join(root,'artifact-manifest.json'),'utf8')).files,'HDL assets changed; review and record the inventory.');
console.log(`HDL: ${files.length} runtime, source and license files verified.`);
