"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { CheckCheck, Download, Play, RotateCcw, Square, Terminal, Waves, Code2, FileText, CircleCheck, CircleX } from 'lucide-react';
import type { HdlChallenge } from '@/lib/hdl-challenges';
import { hdlCheckResult } from '@/lib/hdl-challenges';
import { simulateHdl, type HdlLanguage, type HdlResult } from '@/lib/hdl-client';
import { HdlCodeEditor } from './hdl-code-editor';
import { HdlResizeHandle } from './hdl-resize-handle';
import { hdlDiagnostics, hdlFailureExamples, saveHdlPractice } from '@/lib/hdl-practice';
import styles from './hdl-workspace.module.css';

function download(name: string, contents: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HdlWorkspace({ challenge, playground=false }: { challenge: Omit<HdlChallenge, 'solution'>; playground?: boolean }) {
  const paneId=useId();
  const [design,setDesign] = useState(challenge.starter);
  const [testbench,setTestbench] = useState(challenge.testbench);
  const [language,setLanguage] = useState<HdlLanguage>('2012');
  const [file,setFile] = useState<'design'|'testbench'|'supplied'>('design');
  const [layout,setLayout] = useState<'tabs'|'split'|'stacked'>('tabs');
  const [panel,setPanel] = useState<'tests'|'console'|'waveforms'>('tests');
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
  const [questionWidth,setQuestionWidth]=useState(31), [editorShare,setEditorShare]=useState(53), [dragging,setDragging]=useState(false);
  const [runKind,setRunKind]=useState<'run'|'submit'>('run');
  const [reveal,setReveal]=useState<{file:'design'|'testbench'|'supplied';line:number;revision:number}>();
  const bodyRef=useRef<HTMLDivElement>(null), codingRef=useRef<HTMLDivElement>(null);
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
    cancelRef.current=null; setBusy(false);
    setResult(null); setVerdict(null); setError(''); setWaveReady(false); setStatus('Draft changed · run again');
  }
  function editDesign(value:string) { invalidateOutput(); setDesign(value); }
  function editTestbench(value:string) { invalidateOutput(); setTestbench(value); }
  async function run(check=false) {
    cancelRef.current?.(); setBusy(true); setStatus('Loading Icarus'); setError(''); setVerdict(null); setWaveReady(false); setResult(null); setPanel(check?'tests':'console'); setRunKind(check?'submit':'run');
    const revision=++revisionRef.current;
    const task=simulateHdl({design,testbench:check?challenge.testbench:testbench,language},stage=>{if(revision===revisionRef.current)setStatus(stage);});
    cancelRef.current=task.cancel;
    try {
      const output=await task.result;
      if(revision!==revisionRef.current)return;
      setResult(output);
      if(check){const checked=hdlCheckResult(output.log,output.exitCode,challenge.checks);setVerdict(checked.passed?'passed':'failed');saveHdlPractice(challenge.slug,{...checked,submittedAt:new Date().toISOString()});}
      setStatus(output.exitCode===0?'Finished':'Compile or simulation error');
      if(!check && output.vcd && output.exitCode===0)setPanel('waveforms');
    } catch(cause) { if(revision===revisionRef.current){setError(cause instanceof Error?cause.message:'Simulation failed.'); setStatus('Stopped');} }
    finally{if(revision===revisionRef.current){cancelRef.current=null;setBusy(false);}}
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
  const checked=result?hdlCheckResult(result.log,result.exitCode,challenge.checks):null;
  const examples=result?hdlFailureExamples(result.log):[];
  const diagnostics=result?hdlDiagnostics(result.log):[];
  const jump=(target:{file:'design'|'testbench';line:number})=>{const destination=target.file==='testbench'&&runKind==='submit'?'supplied':target.file;setFile(destination);setReveal(previous=>({...target,file:destination,revision:(previous?.revision??0)+1}));};
  // Shortcuts bubble from the focused editor or control; the region itself
  // adds no focus stop and all actions also have ordinary accessible buttons.
  // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
  return <div className={styles.workspace} role="region" aria-label="HDL workbench" data-resizing={dragging} style={{'--question-width':questionWidth+'%','--editor-share':editorShare+'%'} as CSSProperties} onKeyDown={event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&hydrated&&!busy){event.preventDefault();void run(event.shiftKey&&!playground);}
  }}>
    <div className={styles.toolbar}>
      <strong><Code2 size={16}/> HDL workbench</strong>
      <div className={styles.actions}>
        <label><span className={styles.visuallyHidden}>HDL language</span><select aria-label="HDL language" value={language} disabled={busy||!hydrated} onChange={event=>{invalidateOutput();setLanguage(event.target.value as HdlLanguage);}}><option value="2012">SystemVerilog 2012</option><option value="2005">Verilog 2005</option></select></label>
        <button type="button" disabled={!hydrated} onClick={()=>void exportProject()} title="Download sources and local simulator commands"><Download size={14}/>Project</button>
        {busy?<button type="button" onClick={()=>cancelRef.current?.()}><Square size={13}/>Stop</button>:<button type="button" disabled={!hydrated} onClick={()=>void run()} title="Run your editable testbench · Ctrl/⌘ Enter"><Play size={14}/>Run</button>}
        {!playground&&<button type="button" className={styles.run} disabled={busy||!hydrated} onClick={()=>void run(true)} title="Run the supplied checks · Ctrl/⌘ Shift Enter"><CheckCheck size={15}/>Submit</button>}
      </div>
    </div>
    <div className={styles.body} ref={bodyRef}>
      <aside id={`${paneId}-description`} className={styles.problem} aria-label="Problem description">
        <div className={styles.sectionTitle}><FileText size={15}/> Description</div>
        <div className={styles.problemContent}><span className={styles.topic}>{challenge.level} · {challenge.topic}</span><h1>{challenge.title}</h1><p>{challenge.description}</p>
        <h2>Specification</h2><ul>{challenge.specification.map(item=><li key={item}>{item}</li>)}</ul>
        <div className={styles.checkNote}><strong>{challenge.checks.toLocaleString()} supplied checks</strong><p>Run uses the testbench in tb.sv. {!playground&&'Submit checks your design with the original supplied testbench, even if you edit tb.sv.'}</p><p>Practice results stay in this browser. They do not count as server-verified scores.</p></div>
        {challenge.analogLink&&<p className={styles.hint}><a href={challenge.analogLink}>Explore the analog circuit →</a></p>}
        <details><summary>Language and tools</summary><p>Choose Verilog 2005 or SystemVerilog 2012. Icarus supports a subset of SystemVerilog; classes, UVM and full SVA are outside this runtime. Download the project to continue in OSS CAD Suite with Icarus, Yosys and GTKWave.</p><p><a href="/hdl/NOTICE.txt">Open-source credits and runtime provenance</a></p></details>
        <p className={styles.hint}>Drag the dividers to resize. Focus a divider and use its arrow keys for precise adjustments.</p></div>
      </aside>
      <HdlResizeHandle axis="x" value={questionWidth} min={22} max={48} container={bodyRef} label="Resize problem description" controls={`${paneId}-description`} onChange={setQuestionWidth} onDragging={setDragging}/>
      <div className={styles.coding} ref={codingRef}>
        <section id={`${paneId}-editor`} className={styles.editorArea} aria-label="HDL source files">
          <div className={styles.filebar}><div className={styles.tabs} role="tablist" aria-label="Source files"><button type="button" role="tab" disabled={!hydrated} aria-selected={file==='design'} onClick={()=>setFile('design')}>design.sv</button><button type="button" role="tab" disabled={!hydrated} aria-selected={file==='testbench'} onClick={()=>setFile('testbench')}>tb.sv</button>{!playground&&<button type="button" role="tab" aria-selected={file==='supplied'} onClick={()=>setFile('supplied')}>Supplied tests</button>}</div><span className={styles.draft}>Local draft</span><button type="button" disabled={!hydrated} onClick={()=>{if(window.confirm('Replace this draft with the starter files?')){invalidateOutput();setDesign(challenge.starter);setTestbench(challenge.testbench);}}}><RotateCcw size={13}/>Reset</button></div>
          <div className={styles.editor} hidden={file!=='design'}><HdlCodeEditor label="Design source" value={design} onChange={editDesign} reveal={reveal?.file==='design'?reveal:undefined}/></div>
          <div className={styles.editor} hidden={file!=='testbench'}><HdlCodeEditor label="Testbench source" value={testbench} onChange={editTestbench} reveal={reveal?.file==='testbench'?reveal:undefined}/></div>
          {!playground&&<div className={styles.editor} hidden={file!=='supplied'}><HdlCodeEditor label="Supplied testbench source" value={challenge.testbench} onChange={()=>{}} readOnly reveal={reveal?.file==='supplied'?reveal:undefined}/></div>}
        </section>
        <HdlResizeHandle axis="y" value={editorShare} min={30} max={68} container={codingRef} label="Resize editor and results" controls={`${paneId}-editor`} onChange={setEditorShare} onDragging={setDragging}/>
        <section className={styles.results} aria-label="HDL simulation results">
          <div className={styles.resultsHeader}>
            <div className={styles.tabs} role="tablist" aria-label="HDL output"><button type="button" role="tab" aria-selected={panel==='tests'} onClick={()=>setPanel('tests')}><CheckCheck size={14}/>Test results</button><button type="button" role="tab" aria-selected={panel==='console'} onClick={()=>setPanel('console')}><Terminal size={14}/>Console</button><button type="button" role="tab" aria-selected={panel==='waveforms'} onClick={()=>setPanel('waveforms')}><Waves size={15}/>Waveforms</button></div>
            <div className={styles.actions}><label><span className={styles.visuallyHidden}>Output layout</span><select aria-label="Output layout" value={layout} onChange={event=>{setLayout(event.target.value as typeof layout);if(panel==='tests')setPanel('console');}}><option value="tabs">Tabs</option><option value="split">Side by side</option><option value="stacked">Stacked / scroll</option></select></label><button type="button" disabled={!result?.vcd} onClick={()=>result?.vcd&&download('dump.vcd',result.vcd)}><Download size={13}/>VCD</button></div>
          </div>
          <div className={styles.statusbar}><span className={`${styles.status} ${verdict==='passed'?styles.success:verdict==='failed'?styles.error:''}`} role="status">{verdict==='passed'?`All ${challenge.checks.toLocaleString()} practice checks passed`:verdict==='failed'?'Some practice checks failed':status}{result&&` · ${(result.runtimeMs/1000).toFixed(2)} s`}</span><span>{runKind==='submit'?'Supplied testbench':'Editable testbench'}</span></div>
          {panel==='tests'&&<div className={styles.testResults} aria-label="Test case results">
            {error?<p className={styles.error}>{error}</p>:!result?<p>{busy?'Running your design…':playground?'Run your design and editable testbench to inspect its output and waveforms.':`Submit your design to run all ${challenge.checks.toLocaleString()} supplied checks. Run lets you experiment with your own testbench first.`}</p>:<>
              <div className={styles.verdict}>{checked?.passed?<CircleCheck size={22}/>:<CircleX size={22}/>}<div><strong>{checked?.checks? `${(checked.checks-checked.failures).toLocaleString()} / ${checked.checks.toLocaleString()} checks passed`:'No complete test report'}</strong><p>{runKind==='submit'?'Supplied checks against the current design.':'Results reported by your editable testbench.'}{checked&&checked.checks!==challenge.checks&&runKind==='submit'?' The simulation ended before all supplied checks completed.':''}</p></div></div>
              {diagnostics.length>0&&<div className={styles.diagnostics}>{diagnostics.map(item=><button key={item.file+item.line+item.message} type="button" onClick={()=>jump(item)}>{item.file==='design'?'design.sv':'tb.sv'}:{item.line} — {item.message}</button>)}</div>}
              {examples.length>0&&<><p className={styles.hint}>First passing checks and up to 20 failures. The count above includes every executed check. Times use the testbench’s displayed precision.</p><ul className={styles.caseList}>{examples.map(item=><li key={item.index??item.description+item.time} data-passed={item.passed}>{item.passed?<CircleCheck size={15}/>:<CircleX size={15}/>}<span>{item.index? `Check ${item.index}: `:''}{item.description}</span><small>t = {item.time}</small></li>)}</ul></>}
              <pre className={styles.inlineConsole} aria-label="Submission diagnostics">{result.log}</pre>
            </>}
          </div>}
          <div className={`${styles.outputs} ${layout==='split'?styles.split:layout==='stacked'?styles.stacked:''}`} hidden={panel==='tests'}>
            <div className={styles.pane} hidden={!showConsole}><pre className={`${styles.console} ${error?styles.error:''}`} aria-label="Simulator console">{error||result?.log||'Run your design to see compiler diagnostics and testbench output.'}</pre></div>
            <div className={styles.pane} hidden={!showWaves}>{result?.vcd?<iframe ref={frameRef} title="VCDrom logic waveform viewer" className={styles.waveform} src="/hdl/viewer/index.html" onLoad={()=>setWaveReady(true)}/>:<div className={styles.empty}><Waves size={30}/><span>Run a testbench with $dumpfile(&quot;dump.vcd&quot;) and $dumpvars to inspect its signals.</span></div>}</div>
          </div>
        </section>
      </div>
    </div>
    <div className={styles.footnote}>Icarus Verilog · <a href="https://github.com/wavedrom/vcdrom" target="_blank" rel="noreferrer">VCDrom</a> · CodeMirror. Local simulation · 20-second limit. <span>Ctrl/⌘ Enter: Run · Ctrl/⌘ Shift Enter: Submit</span></div>
  </div>;
}
