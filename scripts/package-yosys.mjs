import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const source='node_modules/@yowasp/yosys', target='public/hdl/yosys';
mkdirSync(target,{recursive:true});
const pkg=JSON.parse(readFileSync(source+'/package.json','utf8'));
if(pkg.version!=='0.70.1258')throw Error('Review a Yosys version change before packaging.');
const files=[];
for(const name of readdirSync(source+'/gen')) {
  const bytes=readFileSync(source+'/gen/'+name), compressed=name==='yosys.core.wasm';
  const output=compressed?gzipSync(bytes,{level:9}):bytes, path=name+(compressed?'.gz':'');
  if(output.length>=25*1024*1024)throw Error('Asset too large: '+path);
  writeFileSync(target+'/'+path,output);
  files.push({path,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex'),sourceSha256:createHash('sha256').update(bytes).digest('hex')});
}
copyFileSync(source+'/README.md',target+'/README.md');
writeFileSync(target+'/provenance.json',JSON.stringify({package:pkg.name,version:pkg.version,license:pkg.license,repository:pkg.repository.url,files},null,2)+'\n');
console.log('Packaged pinned YoWASP Yosys; gzip is decompressed locally by the worker.');
