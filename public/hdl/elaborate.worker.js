// Real Yosys elaboration in an isolated, terminable worker; source never leaves the browser.
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(url.endsWith('/yosys.core.wasm')) {
    const response=await originalFetch(url+'.gz',options);
    if(!response.ok)throw Error('Yosys runtime could not be loaded.');
    // Local/static hosts may already decode a .gz asset. Inspect the magic
    // bytes so production and the development asset server use one path.
    const bytes=new Uint8Array(await response.arrayBuffer());
    const body=bytes[0]===31&&bytes[1]===139?new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')):bytes;
    return new Response(body,{headers:{'Content-Type':'application/wasm'}});
  }
  return originalFetch(input,options);
};
self.onmessage=async({data})=>{
  let log='';
  try {
    if(typeof data.design!=='string'||data.design.length>131072||!/^[_a-zA-Z][_a-zA-Z0-9$]*$/.test(data.top))throw Error('Enter a valid top module and a design under 128 KiB.');
    self.postMessage({type:'stage',stage:'Loading Yosys…'});
    const {runYosys}=await import('./yosys/bundle.js');
    self.postMessage({type:'stage',stage:'Elaborating design…'});
    // Strip the compiler's ANSI color escapes from plain-text diagnostics.
    // eslint-disable-next-line no-control-regex
    const output=bytes=>{if(bytes&&log.length<131072)log+=new TextDecoder().decode(bytes).replace(/\x1b\[[0-9;]*m/g,'');};
    const files=await runYosys(['-Q','-T','-p',`read_verilog -sv design.sv; hierarchy -check -top ${data.top}; proc; opt_clean; write_json netlist.json`],{'design.sv':data.design},{stdout:output,stderr:output,decodeASCII:true});
    const raw=files?.['netlist.json'];
    if(!raw)throw Error('Yosys did not produce a netlist.');
    const text=typeof raw==='string'?raw:new TextDecoder().decode(raw);
    if(text.length>8*1024*1024)throw Error('Elaborated netlist exceeds the 8 MiB browser display budget.');
    self.postMessage({type:'result',netlist:JSON.parse(text),log});
  } catch(error) {self.postMessage({type:'error',error:(error?.message||String(error))+'\n'+log});}
};
