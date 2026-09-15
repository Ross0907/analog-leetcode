"use client";

import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, MousePointer2, Pause, Play, Radio, RotateCcw, Save, Trash2, Waves } from 'lucide-react';
import { captureCircuitJs, circuitJsElementName, circuitJsNodeOptions, CIRCUITJS_PROBE_COLORS, MAX_CIRCUITJS_PROBES, readCircuitJsProbe, supportsCircuitJsCurrent, validateCircuitJsText, type CircuitJsApi, type CircuitJsElement, type CircuitJsProbe } from '../../lib/circuitjs';
import { CIRCUITJS_LAB_STARTER } from '../../lib/circuitjs-starters';
import type { SimulationPayload } from '../../lib/simulator-contract';
import type { CircuitDocument } from '../../lib/circuit-document';
import { circuitJsGradingDocument } from '../../lib/circuitjs-grading';
import { generateSpiceDeckFromCircuitDocument } from '../../lib/circuit-spice';
import { ScopeResult } from './simulation-console';
import styles from './circuitjs-workbench.module.css';
import { KiCadSymbolPalette } from './kicad-symbol-palette';
import { neutralCircuitJsPresentation } from '../../lib/circuitjs';

type CircuitWindow = Window & { CircuitJS1?: CircuitJsApi };
type SavedProbe = Pick<CircuitJsProbe, 'id' | 'name' | 'kind' | 'post' | 'color' | 'enabled'> & { elementIndex: number };
type SavedCircuit = { version: 1; circuit: string; probes: SavedProbe[]; duration?: number; samples?: number };
type Marker = { id: string; x: number; y: number; color: string; label: string };

export function CircuitJsWorkbench({ initialCircuit = CIRCUITJS_LAB_STARTER, storageKey = 'lab', modelNote, onPrepareGrading }: { initialCircuit?: string; storageKey?: string; modelNote?: string; onPrepareGrading?: (document: CircuitDocument, deck: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<CircuitJsApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probesRef = useRef<CircuitJsProbe[]>([]);
  const modeRef = useRef<'edit' | 'voltage' | 'current'>('edit');
  const cancelCaptureRef = useRef<((message?: string) => void) | null>(null);
  const restoredProbesRef = useRef<SavedProbe[] | null>(null);
  const mountedRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Loading the CircuitJS editor…');
  const [error, setError] = useState<string | null>(null);
  const [elements, setElements] = useState<CircuitJsElement[]>([]);
  const [probes, setProbes] = useState<CircuitJsProbe[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [mode, setMode] = useState<'edit' | 'voltage' | 'current'>('edit');
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedCurrent, setSelectedCurrent] = useState('');
  const [duration, setDuration] = useState(storageKey === 'mosfet-gate-drive' ? '0.000004' : storageKey === 'transimpedance-stability' ? '0.00002' : '0.01');
  const [samples, setSamples] = useState('2048');
  const [capturing, setCapturing] = useState(false);
  const [payload, setPayload] = useState<SimulationPayload | null>(null);
  const [tab, setTab] = useState<'editor' | 'instruments'>('editor');
  const instrumentRef = useRef<HTMLDivElement>(null);
  const nodes = circuitJsNodeOptions(elements);

  function updateProbes(next: CircuitJsProbe[]) { probesRef.current = next; setProbes(next); }
  function changeMode(next: typeof mode) {
    apiRef.current?.addElement('Select');
    modeRef.current = next;
    setMode(next);
  }

  function addProbe(element: CircuitJsElement, post: number, kind: 'voltage' | 'current', suggestedName?: string) {
    const current = probesRef.current;
    if (current.length >= MAX_CIRCUITJS_PROBES) { setError('The oscilloscope supports up to 32 probes. Remove a probe to add another.'); return; }
    if (kind === 'current' && !supportsCircuitJsCurrent(element)) { setError('Choose a two-terminal component to measure branch current.'); return; }
    if (current.some((probe) => probe.kind === kind && (kind === 'current' ? probe.element === element : probe.element.getNodeId(probe.post) === element.getNodeId(post)))) { setStatus('This node or component already has a probe.'); return; }
    const index = apiRef.current?.getElements().indexOf(element) ?? 0;
    const name = suggestedName ?? (kind === 'voltage' ? `V(node ${element.getNodeId(post)})` : `I(${circuitJsElementName(element, index)})`);
    updateProbes([...current, { id: crypto.randomUUID(), name, kind, element, post, color: CIRCUITJS_PROBE_COLORS[current.length % CIRCUITJS_PROBE_COLORS.length], enabled: true }]);
    setError(null); setStatus(`${name} added. Capture to compare all enabled probes.`);
  }

  useEffect(() => {
    mountedRef.current = true;
    let initialized = false;
    let detach = () => {};
    const started = Date.now();
    const timer = setInterval(() => {
      let nativeWindow: CircuitWindow | null;
      let api: CircuitJsApi | undefined;
      try { nativeWindow = iframeRef.current?.contentWindow as CircuitWindow | null; api = nativeWindow?.CircuitJS1; }
      catch { clearInterval(timer); setError('The editor was blocked by the browser’s embedding policy. Reload after correcting the same-origin frame policy.'); return; }
      if (!api) {
        if (Date.now() - started > 30_000) setError('The editor did not load. Reload the page and check that the local CircuitJS assets are available.');
        return;
      }
      if (!initialized) {
        initialized = true;
        apiRef.current = api;
        let starter = initialCircuit;
        try {
          const saved = JSON.parse(localStorage.getItem(`anacode:circuitjs:${storageKey}`) ?? 'null') as SavedCircuit | null;
          if (saved?.version === 1 && typeof saved.circuit === 'string') {
            starter = validateCircuitJsText(saved.circuit); restoredProbesRef.current = Array.isArray(saved.probes) ? saved.probes.slice(0, MAX_CIRCUITJS_PROBES) : null;
            if (typeof saved.duration === 'number' && saved.duration >= 1e-9 && saved.duration <= 10) setDuration(String(saved.duration));
            if (typeof saved.samples === 'number' && [128, 256, 512, 1024, 2048, 4096, 8192, 16384].includes(saved.samples)) setSamples(String(saved.samples));
          }
        } catch { /* Corrupt or unavailable local storage leaves the authored starter intact. */ }
        api.onanalyze = () => {
          cancelCaptureRef.current?.('Circuit changed during capture. Start another capture after finishing the edit.');
          const nativeElements = api.getElements();
          setError(api.getStopMessage());
          setElements(nativeElements);
          const previous = probesRef.current.filter((probe) => nativeElements.includes(probe.element));
          if (restoredProbesRef.current) {
            const restored = restoredProbesRef.current.flatMap((probe) => {
              const element = nativeElements[probe.elementIndex];
              if (!element || !['voltage', 'current'].includes(probe.kind) || !Number.isInteger(probe.post) || probe.post < 0 || probe.post >= element.getPostCount()) return [];
              return [{ ...probe, id: typeof probe.id === 'string' ? probe.id : crypto.randomUUID(), name: String(probe.name).slice(0, 80), color: /^#[a-f\d]{6}$/i.test(probe.color) ? probe.color : CIRCUITJS_PROBE_COLORS[0], element, enabled: probe.enabled !== false }];
            });
            restoredProbesRef.current = null;
            probesRef.current = restored; setProbes(restored);
          } else if (previous.length) { probesRef.current = previous; setProbes(previous); }
          else {
            const nodeOptions = circuitJsNodeOptions(nativeElements).filter((node) => node.id !== 0).slice(0, 2);
            const defaults: CircuitJsProbe[] = nodeOptions.map((node, index) => ({ id: crypto.randomUUID(), name: `V(${node.name.includes('·') ? `node ${node.id}` : node.name})`, kind: 'voltage', element: node.element, post: node.post, color: CIRCUITJS_PROBE_COLORS[index], enabled: true }));
            probesRef.current = defaults; setProbes(defaults);
          }
        };
        api.importCircuit(neutralCircuitJsPresentation(starter), false);
        api.setSimRunning(true);
        const nativeDocument = nativeWindow!.document;
        const click = (event: MouseEvent) => {
          if (modeRef.current === 'edit' || (event.target as Element | null)?.tagName !== 'CANVAS') return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.type !== 'mousedown') return;
          const element = api.getHoveredElement();
          if (!element || element.getPostCount() < 1) { setStatus('Move over a wire or component terminal, then click to place a probe.'); return; }
          const canvas = event.target as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          let post = 0;
          let distance = Infinity;
          for (let index = 0; index < element.getPostCount(); index++) {
            const dx = api.screenX(element.getPostX(index)) - (event.clientX - rect.left);
            const dy = api.screenY(element.getPostY(index)) - (event.clientY - rect.top);
            if (dx * dx + dy * dy < distance) { post = index; distance = dx * dx + dy * dy; }
          }
          // Native hit testing identifies the wire; all its terminals share one solved node.
          const current = probesRef.current;
          const kind = modeRef.current;
          if (kind === 'current' && !supportsCircuitJsCurrent(element)) { setError('Current probing is available on two-terminal components.'); return; }
          if (current.length >= MAX_CIRCUITJS_PROBES) { setError('A maximum of 32 probes is supported.'); return; }
          if (current.some((probe) => probe.kind === kind && (kind === 'current' ? probe.element === element : probe.element.getNodeId(probe.post) === element.getNodeId(post)))) return;
          const index = api.getElements().indexOf(element);
          const label = element.getType() === 'LabeledNodeElm' ? element.getLabelName() : `node ${element.getNodeId(post)}`;
          const name = kind === 'voltage' ? `V(${label})` : `I(${circuitJsElementName(element, index)})`;
          const next = [...current, { id: crypto.randomUUID(), name, kind, element, post, color: CIRCUITJS_PROBE_COLORS[current.length % CIRCUITJS_PROBE_COLORS.length], enabled: true }];
          probesRef.current = next; setProbes(next); setError(null); setStatus(`${name} added.`);
        };
        const events = ['mousedown', 'mouseup', 'click'] as const;
        // detach() below removes all three listeners from the effect's cleanup.
        // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
        events.forEach((event) => nativeDocument.addEventListener(event, click, true));
        const wheel = (event: WheelEvent) => {
          // Native iframe wheel events cannot scroll their parent document.
          // Modified gestures call the native zoom command without browser zoom.
          if ((event.target as Element | null)?.tagName !== 'CANVAS') return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.ctrlKey || event.metaKey) {
            if (event.deltaY) api.zoomCircuit(event.deltaY < 0 ? 1 : -1);
            return;
          }
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
          const delta = event.deltaY * unit;
          if (!delta) return;
          for (let parent = iframeRef.current?.parentElement; parent; parent = parent.parentElement) {
            if (!['auto', 'scroll'].includes(window.getComputedStyle(parent).overflowY)) continue;
            const remaining = parent.scrollHeight - parent.clientHeight - parent.scrollTop;
            if ((delta > 0 && remaining > 1) || (delta < 0 && parent.scrollTop > 0)) {
              parent.scrollTop += delta;
              return;
            }
          }
          window.scrollBy({ top: delta, behavior: 'instant' });
        };
        // This listener is removed by detach() in the effect cleanup below.
        // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
        nativeDocument.addEventListener('wheel', wheel, { capture: true, passive: false });
        detach = () => {
          events.forEach((event) => nativeDocument.removeEventListener(event, click, true));
          nativeDocument.removeEventListener('wheel', wheel, true);
        };
        setReady(true); setStatus('Editor ready. Draw circuits, choose any node, and capture multiple probes.');
      }
      setRunning(api.isRunning());
      const stop = api.getStopMessage();
      if (stop) { setError(stop); cancelCaptureRef.current?.(stop); }
      const readings: Record<string, number> = {};
      const overlay: Marker[] = [];
      const canvas = nativeWindow!.document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      probesRef.current.forEach((probe, index) => {
        readings[probe.id] = readCircuitJsProbe(probe);
        if (rect && probe.enabled) overlay.push({ id: probe.id, x: rect.left + api.screenX(probe.element.getPostX(probe.post)), y: rect.top + api.screenY(probe.element.getPostY(probe.post)), color: probe.color, label: `${index + 1}` });
      });
      setValues(readings); setMarkers(overlay);
    }, 150);
    return () => {
      mountedRef.current = false; clearInterval(timer); detach(); cancelCaptureRef.current?.();
      if (apiRef.current) { apiRef.current.setSimRunning(false); apiRef.current.onanalyze = undefined; }
      apiRef.current = null;
    };
  }, [initialCircuit, storageKey]);

  function saveCircuit(download: boolean) {
    const api = apiRef.current; if (!api) return;
    const circuit = api.exportCircuit();
    if (download) {
      const url = URL.createObjectURL(new Blob([circuit], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `${storageKey}.circuitjs.txt`; link.click(); URL.revokeObjectURL(url);
      setStatus('CircuitJS circuit exported. It opens in this editor or upstream CircuitJS.');
      return;
    }
    const nativeElements = api.getElements();
    const saved: SavedCircuit = { version: 1, circuit, duration: Number(duration), samples: Number(samples), probes: probesRef.current.map(({ element, ...probe }) => ({ ...probe, elementIndex: nativeElements.indexOf(element) })) };
    try { localStorage.setItem(`anacode:circuitjs:${storageKey}`, JSON.stringify(saved)); setStatus('Circuit and probes saved in this browser.'); }
    catch { setError('Browser storage is full or unavailable. Export the circuit to keep a copy.'); }
  }

  async function capture() {
    const api = apiRef.current; if (!api) return;
    try {
      setError(null); setCapturing(true);
      const capture = captureCircuitJs(api, probesRef.current, Number(duration), Number(samples));
      cancelCaptureRef.current = capture.cancel;
      const result = await capture.result;
      if (!mountedRef.current) return;
      setPayload(result); setTab('instruments'); setStatus(`Captured ${result.x.length.toLocaleString()} solver samples across ${result.traces.length} probes.`);
      instrumentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (cause) { if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Capture failed.'); }
    finally { cancelCaptureRef.current = null; if (mountedRef.current) setCapturing(false); }
  }

  return <section className={styles.workbench} aria-label="CircuitJS schematic and simulation workspace">
    <div className={styles.heading}><div><strong>CircuitJS circuit workspace</strong><span>Real components · native wiring · live simulation</span></div><a href="/circuitjs/NOTICE.html" target="_blank" rel="noreferrer">Open-source editor &amp; licenses</a></div>
    <div className={styles.toolbar}>
      <button type="button" aria-pressed={tab === 'editor'} onClick={() => setTab('editor')}><MousePointer2 size={16}/> Schematic</button>
      <button type="button" aria-pressed={tab === 'instruments'} onClick={() => setTab('instruments')}><Waves size={16}/> Oscilloscope &amp; FFT</button>
      <span className={styles.spacer}/>
      <button type="button" disabled={!ready || capturing} onClick={() => { apiRef.current?.setSimRunning(!running); setRunning(!running); }}>{running ? <Pause size={15}/> : <Play size={15}/>} {running ? 'Pause' : 'Run'}</button>
      <button type="button" disabled={!ready || capturing} onClick={() => saveCircuit(false)}><Save size={15}/> Save</button>
      <button type="button" disabled={!ready || capturing} onClick={() => saveCircuit(true)}><Download size={15}/> Export</button>
      <button type="button" disabled={!ready || capturing} onClick={() => inputRef.current?.click()}><FolderOpen size={15}/> Open</button>
      <button type="button" disabled={!ready || capturing} onClick={() => { updateProbes([]); setPayload(null); apiRef.current?.importCircuit(neutralCircuitJsPresentation(initialCircuit), false); apiRef.current?.setSimRunning(true); setStatus('Starter circuit restored.'); setError(null); }}><RotateCcw size={15}/> Restore starter</button>
      {onPrepareGrading && <button type="button" disabled={!ready || capturing} onClick={() => { try { const document = circuitJsGradingDocument(apiRef.current!, storageKey); const generated = generateSpiceDeckFromCircuitDocument(document); onPrepareGrading(document, generated.deck); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare grading.'); } }}>Prepare SPICE &amp; grading</button>}
      <input ref={inputRef} type="file" accept=".txt,.circuitjs,.xml" hidden onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        try { if (file.size > 2_000_000) throw new Error('Choose a circuit smaller than 2 MB.'); const text = neutralCircuitJsPresentation(validateCircuitJsText(await file.text())); updateProbes([]); setPayload(null); apiRef.current?.importCircuit(text, false); apiRef.current?.setSimRunning(true); setError(null); setStatus('Circuit imported.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.'); } event.target.value = '';
      }}/>
    </div>
    {modelNote && <p className={styles.note}>{modelNote}</p>}
    <div hidden={tab !== 'editor'}>
      <KiCadSymbolPalette disabled={!ready || capturing} onAdd={(nativeType) => {
        changeMode('edit');
        apiRef.current?.addElement(nativeType);
        iframeRef.current?.contentWindow?.focus();
        setStatus('Click and drag in the schematic to place the component. Escape cancels placement.');
      }}/>
      <div className={styles.tools}>
        <button type="button" aria-pressed={mode === 'edit'} onClick={() => {
          changeMode('edit');
          setStatus('Edit mode. Select or drag components in the schematic.');
        }}><MousePointer2 size={15}/> Edit</button>
        <button type="button" aria-pressed={mode === 'voltage'} onClick={() => changeMode('voltage')}><Radio size={15}/> Voltage probe</button>
        <button type="button" aria-pressed={mode === 'current'} onClick={() => changeMode('current')}><Radio size={15}/> Current probe</button>
        <span>{mode === 'edit' ? 'Use Draw to add components; right-click to edit. W: wire · Ctrl+Z: undo · scroll to move down · Ctrl/Cmd + scroll: zoom.' : mode === 'voltage' ? 'Click a wire or terminal. Repeat to add multiple channels.' : 'Click a two-terminal component to measure its current.'}</span>
      </div>
      <div className={styles.frameWrap}>
        <iframe ref={iframeRef} className={styles.frame} title="CircuitJS schematic editor" src="/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&usResistors=true&cct=%24%204%200.000001%2010%2050%205%2050%205e-11" allow="clipboard-read; clipboard-write"/>
        <div className={styles.markers} aria-hidden="true">{markers.map((marker) => <span key={marker.id} className={styles.marker} style={{ left: marker.x, top: marker.y, color: marker.color, borderColor: marker.color }}>{marker.label}</span>)}</div>
      </div>
    </div>
    <div className={styles.probePanel}>
      <div className={styles.probeHeading}><strong>Probes <span>{probes.length}/{MAX_CIRCUITJS_PROBES}</span></strong><span>Every electrical node is available, including unlabeled junctions.</span></div>
      <div className={styles.addRow}>
        <label>Node voltage <select aria-label="Node voltage probe" value={selectedNode} onChange={(event) => setSelectedNode(event.target.value)}><option value="">Choose any node…</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
        <button type="button" disabled={!ready || selectedNode === '' || capturing} onClick={() => { const node = nodes.find((node) => node.id === Number(selectedNode)); if (node) addProbe(node.element, node.post, 'voltage', `V(${node.name.includes('·') ? `node ${node.id}` : node.name})`); }}>Add voltage</button>
        <label>Branch current <select aria-label="Component current probe" value={selectedCurrent} onChange={(event) => setSelectedCurrent(event.target.value)}><option value="">Choose component…</option>{elements.map((element, index) => supportsCircuitJsCurrent(element) ? <option key={circuitJsElementName(element, index)} value={index}>{circuitJsElementName(element, index)}</option> : null)}</select></label>
        <button type="button" disabled={!ready || selectedCurrent === '' || capturing} onClick={() => { const element = elements[Number(selectedCurrent)]; if (element) addProbe(element, 0, 'current'); }}>Add current</button>
      </div>
      <div className={styles.probes}>{probes.map((probe, index) => <div className={styles.probe} key={probe.id} style={{ borderColor: `${probe.color}70` }}>
        <input type="checkbox" aria-label={`Enable ${probe.name}`} checked={probe.enabled} disabled={capturing} onChange={(event) => updateProbes(probes.map((entry) => entry.id === probe.id ? { ...entry, enabled: event.target.checked } : entry))}/>
        <span style={{ color: probe.color }}>{index + 1}</span>
        <input aria-label={`Probe ${index + 1} color`} type="color" value={probe.color} onChange={(event) => updateProbes(probes.map((entry) => entry.id === probe.id ? { ...entry, color: event.target.value } : entry))}/>
        <input aria-label={`Probe ${index + 1} name`} value={probe.name} maxLength={80} onChange={(event) => updateProbes(probes.map((entry) => entry.id === probe.id ? { ...entry, name: event.target.value } : entry))}/>
        <output>{Number.isFinite(values[probe.id]) ? values[probe.id].toPrecision(4) : '—'} {probe.kind === 'current' ? 'A' : 'V'}</output>
        <button type="button" aria-label={`Remove ${probe.name}`} disabled={capturing} onClick={() => updateProbes(probes.filter((entry) => entry.id !== probe.id))}><Trash2 size={14}/></button>
      </div>)}</div>
    </div>
    <div className={styles.captureBar}>
      <label>Duration (seconds)<input aria-label="Capture duration in seconds" type="number" min="0.000000001" max="10" step="any" value={duration} onChange={(event) => setDuration(event.target.value)}/></label>
      <label>Target samples<select aria-label="Capture target samples" value={samples} onChange={(event) => setSamples(event.target.value)}>{[128, 256, 512, 1024, 2048, 4096, 8192, 16384].map((count) => <option key={count}>{count}</option>)}</select></label>
      <button className={styles.capture} type="button" disabled={!ready || capturing || !probes.some((probe) => probe.enabled)} onClick={capture}><Waves size={17}/>{capturing ? 'Capturing…' : 'Capture all probes'}</button>
      {capturing && <button type="button" onClick={() => cancelCaptureRef.current?.()}>Cancel</button>}
      <p>The capture starts from the current circuit state and pauses when finished. Adaptive solver steps are preserved.</p>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.status} role="status">{status}</p>
    <div ref={instrumentRef} hidden={tab !== 'instruments'} className={styles.instruments}>{payload ? <ScopeResult payload={payload}/> : <div className={styles.empty}><Waves size={30}/><strong>Capture a circuit to inspect its waveforms</strong><p>Add voltage or current probes above, then choose Capture all probes. Each channel comes directly from the native circuit solver.</p></div>}</div>
  </section>;
}
