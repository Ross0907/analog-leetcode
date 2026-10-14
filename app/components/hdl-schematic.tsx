"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { netlistGraph, type YosysNetlist } from '../../lib/hdl-netlist';
function Cell({data}:NodeProps) {
  const cell=data as {label:string;kind:string;inputs:string[];outputs:string[]};
  return <div style={{width:210,minHeight:Math.max(72,48+Math.max(cell.inputs.length,cell.outputs.length)*24),border:'1px solid var(--amber-dark)',borderRadius:5,background:'var(--surface)',color:'var(--ink)',fontSize:11}}><div style={{padding:8,borderBottom:'1px solid var(--line)',overflow:'hidden',textOverflow:'ellipsis'}} title={cell.label}><strong>{cell.kind}</strong><div style={{fontSize:9,color:'var(--muted)'}}>{cell.label}</div></div>{(['inputs','outputs'] as const).flatMap(side=>cell[side].map((name,index)=><div key={side+name} style={{position:'absolute',top:53+index*24,[side==='inputs'?'left':'right']:9}}>{name}<Handle id={(side==='inputs'?'in:':'out:')+name} type={side==='inputs'?'target':'source'} position={side==='inputs'?Position.Left:Position.Right} style={{[side==='inputs'?'left':'right']:-14,background:'var(--amber-dark)'}}/></div>))}</div>;
}
const nodeTypes={cell:Cell};
export function HdlSchematic({design}:{design:string}) {
  const [top,setTop]=useState('top_module'),[selected,setSelected]=useState(''),[result,setResult]=useState<YosysNetlist|null>(null),[source,setSource]=useState(''),[status,setStatus]=useState('Elaborate the design to inspect its actual logic and hierarchy.'),[busy,setBusy]=useState(false),[log,setLog]=useState('');
  const workerRef=useRef<Worker|null>(null),timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{workerRef.current?.terminate();if(timerRef.current)clearTimeout(timerRef.current);},[]);
  function stop(){workerRef.current?.terminate();workerRef.current=null;if(timerRef.current)clearTimeout(timerRef.current);setBusy(false);}
  function elaborate(){
    if(!/^[_a-zA-Z][_a-zA-Z0-9$]*$/.test(top)){setStatus('Enter a valid top module name.');return;}
    stop();setBusy(true);setLog('');setStatus('Loading Yosys…');
    const worker=new Worker('/hdl/elaborate.worker.js',{type:'module'});workerRef.current=worker;
    timerRef.current=setTimeout(()=>{stop();setStatus('Elaboration stopped after 60 seconds. Reduce the design or check unbounded generate loops.');},60000);
    worker.onerror=()=>{stop();setStatus('Yosys could not start. Reload and try again.');};
    worker.onmessage=({data})=>{if(data.type==='stage')setStatus(data.stage);else if(data.type==='error'){stop();setStatus('Elaboration failed. See compiler diagnostics.');setLog(data.error);}else if(data.type==='result'){stop();setResult(data.netlist);setSource(design);setSelected(top);setLog(data.log);setStatus('Elaborated with Yosys · device-independent RTL');}};
    worker.postMessage({design,top});
  }
  const graph=useMemo(()=>{try{return result?.modules[selected]?{...netlistGraph(result.modules[selected]),error:''}:null;}catch(error){return {nodes:[],edges:[],error:error instanceof Error?error.message:String(error)};}},[result,selected]);
  return <section aria-label="Elaborated schematic" style={{display:'flex',flexDirection:'column',height:'100%',minHeight:300,color:'var(--ink)'}}>
    <div style={{display:'flex',gap:8,padding:8,flexWrap:'wrap',fontSize:11,alignItems:'center'}}><label>Top module <input aria-label="Top module" value={top} onChange={event=>setTop(event.target.value)} style={{width:130,background:'var(--surface)',color:'var(--ink)',border:'1px solid var(--line)',padding:5}}/></label><button type="button" onClick={elaborate} disabled={busy}>Elaborate design</button>{busy&&<button type="button" onClick={()=>{stop();setStatus('Elaboration stopped.');}}>Stop elaboration</button>}{result&&<label>Hierarchy <select aria-label="Schematic hierarchy" value={selected} onChange={event=>setSelected(event.target.value)}>{Object.keys(result.modules).map(name=><option key={name}>{name}</option>)}</select></label>}<span role="status">{status}</span>{result&&source!==design&&<strong>Source changed — elaborate again.</strong>}</div>
    {graph?.error&&<p role="alert">{graph.error}</p>}
    <div style={{flex:1,minHeight:240}}>{graph&&!graph.error?<ReactFlow key={selected+source} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesConnectable={false} nodesDraggable={false} fitView minZoom={0.05} maxZoom={3} onNodeDoubleClick={(_,node)=>{if(result?.modules[node.data.kind])setSelected(node.data.kind);}}><Background color="var(--line)"/><Controls showInteractive={false}/></ReactFlow>:<p style={{padding:20,fontSize:12}}>Inspect ports, registers, arithmetic and control logic from the elaborated design. Double-click a module cell to enter its hierarchy.</p>}</div>
    <details style={{padding:8,fontSize:11,maxHeight:180,overflow:'auto'}}><summary>Compiler diagnostics &amp; scope</summary><p>Yosys runs locally. Synthesizable Verilog/SystemVerilog only; testbench delays and simulation tasks are not hardware. This is RTL elaboration, before device mapping, placement or routing. Export the project for your FPGA toolchain.</p><pre style={{whiteSpace:'pre-wrap'}}>{log}</pre></details>
  </section>;
}
