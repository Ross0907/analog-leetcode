"use client";

import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Download, Play, RotateCcw, Square, Terminal, Waves } from 'lucide-react';
import type { HdlChallenge } from '@/lib/hdl-challenges';
import { hdlCheckResult } from '@/lib/hdl-challenges';
import { simulateHdl, type HdlLanguage, type HdlResult } from '@/lib/hdl-client';
import { HdlCodeEditor } from './hdl-code-editor';
import styles from './hdl-workspace.module.css';

function download(name: string, contents: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HdlWorkspace({ challenge, playground=false }: { challenge: Omit<HdlChallenge, 'solution'>; playground?: boolean }) {
  const [design,setDesign] = useState(challenge.starter);
  const [testbench,setTestbench] = useState(challenge.testbench);
  const [language,setLanguage] = useState<HdlLanguage>('2012');
  const [file,setFile] = useState<'design'|'testbench'>('design');
  const [layout,setLayout] = useState<'tabs'|'split'|'stacked'>('tabs');
  const [panel,setPanel] = useState<'console'|'waveforms'>('console');
  const [status,setStatus] = useState('Ready');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<HdlResult|null>(null);
  const [verdict,setVerdict] = useState<'passed'|'failed'|null>(null);
  const [error,setError] = useState('');
  const [hydrated,setHydrated] = useState(false);
  const cancelRef = useRef<(()=>void)|null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const revisionRef = useRef(0);
  const [waveReady,setWaveReady] = useState(false);
  const draftKey = `anacode-hdl-v1:${challenge.slug}`;

  useEffect(() => {
    // Hydrate the browser-only draft after the server markup has mounted.
    // This subscription-style callback also avoids overwriting a stored draft
    // with the starter during hydration or React's development effect replay.
    const restore = window.setTimeout(() => { try {
      const raw=localStorage.getItem(draftKey);
      const saved=raw && JSON.parse(raw);
      if (saved && typeof saved.design==='string' && typeof saved.testbench==='string' && saved.design.length<=131072 && saved.testbench.length<=131072) {
        setDesign(saved.design); setTestbench(saved.testbench);
        if(['2012','2005'].includes(saved.language))setLanguage(saved.language);
      }
    } catch { /* Storage may be disabled. */ }
    setHydrated(true);
    }, 0);
    return () => { clearTimeout(restore); cancelRef.current?.(); };
  },[draftKey]);
  useEffect(() => {
    if(!hydrated)return;
    try{localStorage.setItem(draftKey,JSON.stringify({design,testbench,language}));}catch{/* Keep editor usable without storage. */}
  },[design,testbench,language,draftKey,hydrated]);
  useEffect(() => {
    const listener=(event:MessageEvent)=>{
      if(event.origin!==location.origin || event.source!==frameRef.current?.contentWindow)return;
      if(event.data?.type==='anacode-viewer-ready')setWaveReady(true);
    };
    window.addEventListener('message',listener);
    return ()=>window.removeEventListener('message',listener);
  },[]);
  useEffect(() => {
    if(waveReady && result?.vcd)frameRef.current?.contentWindow?.postMessage({type:'anacode-vcd',vcd:result.vcd},location.origin);
  },[waveReady,result]);
  function invalidateOutput() {
    revisionRef.current++;
    cancelRef.current?.();
    setResult(null); setVerdict(null); setError(''); setWaveReady(false); setStatus('Draft changed · run again');
  }
  function editDesign(value:string) { invalidateOutput(); setDesign(value); }
  function editTestbench(value:string) { invalidateOutput(); setTestbench(value); }
  async function run(check=false) {
    cancelRef.current?.(); setBusy(true); setStatus('Loading Icarus'); setError(''); setVerdict(null); setWaveReady(false); setResult(null); setPanel('console');
    const revision=revisionRef.current;
    const task=simulateHdl({design,testbench:check?challenge.testbench:testbench,language},stage=>{if(revision===revisionRef.current)setStatus(stage);});
    cancelRef.current=task.cancel;
    try {
      const output=await task.result;
      if(revision!==revisionRef.current)return;
      setResult(output);
      if(check)setVerdict(hdlCheckResult(output.log,output.exitCode,challenge.checks).passed?'passed':'failed');
      setStatus(output.exitCode===0?'Finished':'Compile or simulation error');
      if(output.vcd && output.exitCode===0)setPanel('waveforms');
    } catch(cause) { if(revision===revisionRef.current){setError(cause instanceof Error?cause.message:'Simulation failed.'); setStatus('Stopped');} }
    finally{cancelRef.current=null;setBusy(false);}
  }
  async function exportProject() {
    const {zipSync,strToU8}=await import('fflate');
    const files={
      'design.sv':strToU8(design),'tb.sv':strToU8(testbench),
      'Makefile':strToU8(`run:\n\tiverilog -g${language} -s tb -o sim.vvp design.sv tb.sv\n\tvvp sim.vvp\n\nsynth:\n\tyosys -p 'read_verilog -sv design.sv; hierarchy -top top_module; synth -top top_module; stat; write_json netlist.json'\n\nwave:\n\tgtkwave dump.vcd\n`),
      'run.bat':strToU8(`@echo off\r\niverilog -g${language} -s tb -o sim.vvp design.sv tb.sv\r\nif errorlevel 1 exit /b 1\r\nvvp sim.vvp\r\n`),
      'README.txt':strToU8('AnaCode HDL project\nInstall OSS CAD Suite: https://github.com/YosysHQ/oss-cad-suite-build\nAfter activating its environment, run run.bat (Windows) or make run.\nmake wave opens GTKWave. make synth runs Yosys and exports a JSON netlist.\nYosys synthesizes design.sv only; testbench timing is not hardware. Some SystemVerilog constructs require slang or a different simulator.\n'),
    };
    download(`${challenge.slug}.zip`,new Uint8Array(zipSync(files)).buffer,'application/zip');
  }
  const showConsole=layout!=='tabs'||panel==='console';
  const showWaves=layout!=='tabs'||panel==='waveforms';
  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <strong>HDL workbench</strong>
      <div className={styles.actions}>
        <label><span className={styles.visuallyHidden}>HDL language</span><select aria-label="HDL language" value={language} disabled={busy||!hydrated} onChange={e=>{invalidateOutput();setLanguage(e.target.value as HdlLanguage);}}><option value="2012">SystemVerilog 2012</option><option value="2005">Verilog 2005</option></select></label>
        <button type="button" disabled={!hydrated} onClick={()=>void exportProject()}><Download size={14}/>Project</button>
        {busy?<button type="button" onClick={()=>cancelRef.current?.()}><Square size={13}/>Stop</button>:<button type="button" disabled={!hydrated} className={styles.run} onClick={()=>void run()}><Play size={14}/>Run</button>}
        {!playground&&<button type="button" disabled={busy||!hydrated} onClick={()=>void run(true)}><CheckCheck size={15}/>Check solution</button>}
      </div>
    </div>
    <div className={styles.body}>
      <aside className={styles.problem}>
        <span className={styles.topic}>{challenge.level} · {challenge.topic}</span><h2>{challenge.title}</h2><p>{challenge.description}</p>
        <h3>Specification</h3><ul>{challenge.specification.map(item=><li key={item}>{item}</li>)}</ul>
        <p className={styles.hint}>Run uses your editable testbench. {!playground&&`Check solution runs the supplied ${challenge.checks.toLocaleString()} checks against your design.`} Drafts stay in this browser.</p>
        {challenge.analogLink&&<p className={styles.hint}><a href={challenge.analogLink}>Explore the analog circuit →</a></p>}
        <details><summary>Tools and language support</summary><p>Icarus runs Verilog and its supported SystemVerilog subset. Classes, UVM and full SVA are outside this runtime. Download the project to continue in OSS CAD Suite with Icarus, Yosys and GTKWave.</p><p><a href="/hdl/NOTICE.txt">Open-source credits and runtime provenance</a></p></details>
      </aside>
      <section className={styles.editorArea} aria-label="HDL source files">
        <div className={styles.filebar}><div className={styles.tabs} role="tablist" aria-label="Source files"><button type="button" role="tab" disabled={!hydrated} aria-selected={file==='design'} onClick={()=>setFile('design')}>design.sv</button><button type="button" role="tab" disabled={!hydrated} aria-selected={file==='testbench'} onClick={()=>setFile('testbench')}>tb.sv</button></div><button type="button" disabled={!hydrated} onClick={()=>{if(window.confirm('Replace this draft with the starter files?')){invalidateOutput();setDesign(challenge.starter);setTestbench(challenge.testbench);}}}><RotateCcw size={13}/>Reset</button></div>
        <div className={styles.editor}>{file==='design'?<HdlCodeEditor key="design" label="Design source" value={design} onChange={editDesign}/>:<HdlCodeEditor key="testbench" label="Testbench source" value={testbench} onChange={editTestbench}/>}</div>
      </section>
    </div>
    <section className={styles.results} aria-label="HDL simulation results">
      <div className={styles.resultsHeader}>
        <div className={styles.tabs} role="tablist" aria-label="HDL output"><button type="button" role="tab" aria-selected={panel==='console'} onClick={()=>setPanel('console')}><Terminal size={14}/>Console</button><button type="button" role="tab" aria-selected={panel==='waveforms'} onClick={()=>setPanel('waveforms')}><Waves size={15}/>Waveforms</button></div>
        <span className={`${styles.status} ${verdict==='passed'?styles.success:verdict==='failed'?styles.error:''}`} role="status">{verdict==='passed'?`All ${challenge.checks.toLocaleString()} practice checks passed`:verdict==='failed'?'Some practice checks failed':status}{result&&` · ${(result.runtimeMs/1000).toFixed(2)} s`}</span>
        <div className={styles.actions}><label><span className={styles.visuallyHidden}>Output layout</span><select aria-label="Output layout" value={layout} onChange={e=>setLayout(e.target.value as typeof layout)}><option value="tabs">Tabs</option><option value="split">Side by side</option><option value="stacked">Stacked / scroll</option></select></label><button type="button" disabled={!result?.vcd} onClick={()=>result?.vcd&&download('dump.vcd',result.vcd)}><Download size={13}/>VCD</button></div>
      </div>
      <div className={layout==='split'?styles.split:layout==='stacked'?styles.stacked:undefined}>
        <div className={styles.pane} hidden={!showConsole}><pre className={`${styles.console} ${error?styles.error:''}`} aria-label="Simulator console">{error||result?.log||'Run your design to see compiler diagnostics and testbench output.'}</pre></div>
        <div className={styles.pane} hidden={!showWaves}>{result?.vcd?<iframe ref={frameRef} title="VCDrom logic waveform viewer" className={styles.waveform} src="/hdl/viewer/index.html" onLoad={()=>setWaveReady(true)}/>:<div className={styles.empty}><Waves size={30}/><span>Run a testbench with $dumpfile(&quot;dump.vcd&quot;) and $dumpvars to inspect its signals.</span></div>}</div>
      </div>
    </section>
    <div className={styles.footnote}>Icarus Verilog · <a href="https://github.com/wavedrom/vcdrom" target="_blank" rel="noreferrer">VCDrom</a> waveform viewer · CodeMirror. Simulation runs locally; practice checks are not server-verified scores. Limits: 20 seconds, 128 KiB per source, 8 MiB per generated file.</div>
  </div>;
}
