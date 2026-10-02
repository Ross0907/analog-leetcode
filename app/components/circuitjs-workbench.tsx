"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Download, FolderOpen, MousePointer2, Pause, Play, Radio, RotateCcw, Save, Trash2, Waves } from 'lucide-react';
import { captureCircuitJs, circuitJsElementName, circuitJsNodeOptions, CIRCUITJS_PROBE_COLORS, MAX_CIRCUITJS_PROBES, readCircuitJsProbe, supportsCircuitJsCurrent, validateCircuitJsText, type CircuitJsApi, type CircuitJsElement, type CircuitJsProbe } from '../../lib/circuitjs';
import { CIRCUITJS_LAB_STARTER } from '../../lib/circuitjs-starters';
import type { SimulationPayload } from '../../lib/simulator-contract';
import type { CircuitDocument } from '../../lib/circuit-document';
import { circuitJsGradingDocument } from '../../lib/circuitjs-grading';
import { generateSpiceDeckFromCircuitDocument } from '../../lib/circuit-spice';
import { circuitJsAnalysis, circuitJsAnalysisOptions, circuitJsAnalysisElements, type NativeAnalysisSettings, type NativeSourceOverride } from '../../lib/circuitjs-analysis';
import { ScopeResult, SimulationConsole } from './simulation-console';
import { ACQUISITION_SAMPLE_OPTIONS, startCircuitJsAcquisition, type CircuitJsAcquisition } from '../../lib/circuitjs-acquisition';
import type { JudgeKind } from '../../lib/challenges';
import styles from './circuitjs-workbench.module.css';
import { KiCadSymbolPalette } from './kicad-symbol-palette';
import { neutralCircuitJsPresentation } from '../../lib/circuitjs';
import { WorkspaceDivider } from './workspace-divider';
import { NativeAnalysisControls } from './native-analysis-controls';
import { SchematicProbeOverlay } from './schematic-probe-overlay';
import { applyNativeSource } from '../../lib/circuitjs-advanced';
import ReusableBlockLibrary from './reusable-block-library';
import DesignCheckPanel from './design-check-panel';
import type { DesignCheck } from '../../lib/design-checks';
type CircuitWindow = Window & { CircuitJS1?: CircuitJsApi };
type SavedProbe = Pick<CircuitJsProbe, 'id' | 'name' | 'kind' | 'post' | 'color' | 'enabled'> & { elementIndex: number };
type SavedCircuit = { version: 1; circuit: string; probes: SavedProbe[]; duration?: number; samples?: number; analysisSettings?: NativeAnalysisSettings };
type AnalysisConfig = { initialNetlist: string; probe?: string | readonly string[]; challengeSlug?: string; judge?: JudgeKind; requireSchematic?: boolean };
export function CircuitJsWorkbench({ initialCircuit = CIRCUITJS_LAB_STARTER, storageKey = 'lab', modelNote, onPrepareGrading, analysis, recommendedProbes, wiringInstructions, analysisDefaults, preferredInstrument, designChecks }: { initialCircuit?: string; storageKey?: string; modelNote?: string; onPrepareGrading?: (document: CircuitDocument, deck: string) => void; analysis?: AnalysisConfig; recommendedProbes?: readonly string[]; wiringInstructions?: readonly string[]; analysisDefaults?: Partial<NativeAnalysisSettings>; preferredInstrument?: 'scope' | 'logic'; designChecks?: readonly DesignCheck[] }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<CircuitJsApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probesRef = useRef<CircuitJsProbe[]>([]);
  const modeRef = useRef<'edit' | 'voltage' | 'current'>('edit');
  const cancelCaptureRef = useRef<((message?: string) => void) | null>(null);
  const restoredProbesRef = useRef<SavedProbe[] | null>(null);
  const mountedRef = useRef(true);
  const liveRef = useRef<CircuitJsAcquisition | null>(null);
  const liveConfigRef = useRef({ duration: 0.01, samples: 65536 });
  const lastPublishedRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [nativeApi, setNativeApi] = useState<CircuitJsApi | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Loading the CircuitJS editor…');
  const [error, setError] = useState<string | null>(null);
  const [elements, setElements] = useState<CircuitJsElement[]>([]);
  const [probes, setProbes] = useState<CircuitJsProbe[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'edit' | 'voltage' | 'current'>('edit');
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedCurrent, setSelectedCurrent] = useState('');
  const [duration, setDuration] = useState(analysisDefaults?.duration !== undefined ? String(analysisDefaults.duration) : storageKey === 'mosfet-gate-drive' ? '0.000004' : storageKey === 'transimpedance-stability' ? '0.00002' : '0.01');
  const [samples, setSamples] = useState(String(analysisDefaults?.samples ?? 65536));
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [payload, setPayload] = useState<SimulationPayload | null>(null);
  const [tab, setTab] = useState<'editor' | 'instruments' | 'analysis'>('editor');
  const [layout, setLayout] = useState<'tabs' | 'stacked' | 'split'>('split');
  const [live, setLive] = useState(false);
  const [liveDepth, setLiveDepth] = useState(0);
  const [spicePayload, setSpicePayload] = useState<SimulationPayload | null>(null);
  const [resultSource, setResultSource] = useState<'circuit' | 'spice'>('circuit');
  const [modelNotes, setModelNotes] = useState<string[]>([]);
  const instrumentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editorPercent, setEditorPercent] = useState(56);
  const [editorHeight, setEditorHeight] = useState(640);
  const [probeHeight, setProbeHeight] = useState(210);
  const [resizing, setResizing] = useState(false);
  const [schematicTheme, setSchematicTheme] = useState<'follow' | 'light' | 'dark'>('follow');
  const themeRef = useRef(schematicTheme);
  const [analysisSettings, setAnalysisSettings] = useState<NativeAnalysisSettings>({ type: analysis?.initialNetlist.match(/^\s*\.ac\b/m) ? 'ac-sweep' : analysis?.initialNetlist.match(/^\s*\.op\b/m) ? 'operating-point' : 'transient', duration: .01, samples: 65536, startHz: 10, stopHz: 100000, dcStart: 0, dcStop: 5, dcStep: .05, ...analysisDefaults });
  const settingsRef = useRef(analysisSettings);
  const previousElementsRef = useRef<CircuitJsElement[]>([]);
  const previousAnalysisElementsRef = useRef<CircuitJsElement[]>([]);
  const revisionRef = useRef<number | undefined>(undefined);
  const sourceSnapshotsRef = useRef(new Map<CircuitJsElement, string>());
  const [circuitVersion, setCircuitVersion] = useState(0);
  const nodes = circuitJsNodeOptions(elements);
  const recommendedKey = recommendedProbes?.join('|') ?? '';
  const acceptSpiceResult = useCallback((result: SimulationPayload | null) => { setSpicePayload(result); if (result) { setResultSource('spice'); setTab('instruments'); } }, []);
  useEffect(() => {
    themeRef.current = schematicTheme;
    const updateTheme = () => apiRef.current?.setTheme(schematicTheme === 'follow' ? (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') : schematicTheme);
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [schematicTheme]);
  useEffect(() => { settingsRef.current = analysisSettings; }, [analysisSettings]);
  useEffect(() => {
    const restore = setTimeout(() => { try {
      const saved = JSON.parse(localStorage.getItem('anacode:workbench-layout') ?? 'null');
      if (saved && typeof saved === 'object') {
        if (Number.isFinite(saved.editorPercent)) setEditorPercent(Math.max(30, Math.min(75, saved.editorPercent)));
        if (Number.isFinite(saved.editorHeight)) setEditorHeight(Math.max(300, Math.min(1200, saved.editorHeight)));
        if (Number.isFinite(saved.probeHeight)) setProbeHeight(Math.max(120, Math.min(600, saved.probeHeight)));
        if (['follow', 'light', 'dark'].includes(saved.schematicTheme)) setSchematicTheme(saved.schematicTheme);
      }
    } catch { /* Use defaults when local storage is unavailable. */ } }, 0);
    const dismiss = () => apiRef.current?.dismissEditors?.();
    document.addEventListener('pointerdown', dismiss);
    return () => { clearTimeout(restore); document.removeEventListener('pointerdown', dismiss); };
  }, []);
  const persistLayout = (patch: Record<string, unknown> = {}) => { try { localStorage.setItem('anacode:workbench-layout', JSON.stringify({ editorPercent, editorHeight, probeHeight, schematicTheme, ...patch })); } catch { /* Layout remains usable without storage. */ } };
  function stopLive() { const final = liveRef.current?.snapshot(); if (final) setPayload(final); liveRef.current?.stop(); liveRef.current = null; setLive(false); }
  function navigate(next: typeof tab) { setTab(next === 'analysis' ? 'instruments' : next); if (next === 'analysis') { const settings = analysisRef.current?.querySelector('details'); if (settings) settings.open = true; } }
  function startLive(next = probesRef.current) {
    const api = apiRef.current; if (!api) return;
    liveRef.current?.stop();
    try {
      liveConfigRef.current = { duration: Number(duration), samples: Number(samples) };
      liveRef.current = startCircuitJsAcquisition(api, next, { ...liveConfigRef.current, onError: (message) => { if (mountedRef.current) { setError(message); setLive(false); } } });
      setLive(true); setResultSource('circuit'); setError(null); setStatus('Live measurements are following your circuit. Freeze to inspect a record.');
    } catch (cause) { liveRef.current = null; setLive(false); setError(cause instanceof Error ? cause.message : 'Unable to start measurements.'); }
  }
  function updateProbes(next: CircuitJsProbe[]) {
    const wasLive = Boolean(liveRef.current && !liveRef.current.stopped);
    probesRef.current = next; setProbes(next);
    if (wasLive) startLive(next);
  }
  function prepareGrading() {
    const api = apiRef.current; if (!api) throw new Error('Wait for the circuit to load.');
    const document = circuitJsGradingDocument(api, storageKey);
    const generated = generateSpiceDeckFromCircuitDocument(document);
    onPrepareGrading?.(document, generated.deck);
    return document;
  }
  function prepareCircuit() {
    const api = apiRef.current; if (!api) throw new Error('Wait for the circuit to load.');
    if (analysis?.requireSchematic) prepareGrading();
    const prepared = circuitJsAnalysis(api, { ...settingsRef.current, acSource: settingsRef.current.acSource ?? circuitJsAnalysisOptions(api).sources[0]?.index, duration: Number(duration), samples: Number(samples) });
    setModelNotes(prepared.notes);
    return prepared;
  }
  function applySource(index: number, source: NativeSourceOverride | undefined) {
    const api = apiRef.current; if (!api) throw new Error('Wait for the schematic to load.');
    if (source) applyNativeSource(api, index, source, Number(duration));
    const element = api.getElements()[index];
    if (element) sourceSnapshotsRef.current.set(element, element.exportElement());
    const sourceOverrides = { ...settingsRef.current.sourceOverrides };
    if (source) sourceOverrides[index] = source; else delete sourceOverrides[index];
    settingsRef.current = { ...settingsRef.current, sourceOverrides };
    setAnalysisSettings(settingsRef.current);
    setStatus(source ? 'Source waveform applied to the schematic and SPICE analysis.' : 'SPICE now uses the source stored in the schematic.');
  }
  function changeMode(next: typeof mode) {
    apiRef.current?.addElement('Select');
    modeRef.current = next;
    setMode(next);
  }
  function restoreStarter() {
    const api = apiRef.current; if (!api) return;
    updateProbes([]); setPayload(null); setSpicePayload(null); previousElementsRef.current = [];
    settingsRef.current = { ...settingsRef.current, models: {}, sourceOverrides: {}, acSource: undefined, dcSource: undefined, ...analysisDefaults };
    setAnalysisSettings(settingsRef.current);
    api.importCircuit(neutralCircuitJsPresentation(initialCircuit), false); api.compactComponentLeads?.();
    try {
      for (const [index, source] of Object.entries(settingsRef.current.sourceOverrides ?? {})) applyNativeSource(api, Number(index), source, Number(duration));
      api.setSimRunning(true); setStatus('Starter circuit restored.'); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the starter source settings.'); }
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
        apiRef.current = api; setNativeApi(api);
        api.setTheme(themeRef.current === 'follow' ? (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') : themeRef.current);
        let starter = initialCircuit;
        let freshStarter = true;
        try {
          const saved = JSON.parse(localStorage.getItem(`anacode:circuitjs:${storageKey}`) ?? 'null') as SavedCircuit | null;
          if (saved?.version === 1 && typeof saved.circuit === 'string') {
            freshStarter = false;
            starter = validateCircuitJsText(saved.circuit); restoredProbesRef.current = Array.isArray(saved.probes) ? saved.probes.slice(0, MAX_CIRCUITJS_PROBES) : null;
            if (typeof saved.duration === 'number' && saved.duration >= 1e-9 && saved.duration <= 10) setDuration(String(saved.duration));
            if (typeof saved.samples === 'number' && Number.isInteger(saved.samples) && saved.samples >= 128 && saved.samples <= 131072) setSamples(String(saved.samples));
            if (saved.analysisSettings && typeof saved.analysisSettings === 'object') { settingsRef.current = { ...settingsRef.current, ...saved.analysisSettings }; setAnalysisSettings(settingsRef.current); }
          }
        } catch { /* Corrupt or unavailable local storage leaves the authored starter intact. */ }
        api.onanalyze = () => {
          const revision = api.getCircuitRevision?.();
          if (revision !== undefined && revisionRef.current === revision) return;
          revisionRef.current = revision;
          setCircuitVersion(value => value + 1);
          const resumeLive = Boolean(liveRef.current && !liveRef.current.stopped);
          if (liveRef.current) { liveRef.current.stop(); liveRef.current = null; }
          setSpicePayload(null);
          const nativeElements = api.getElements();
          const analysisElements = circuitJsAnalysisElements(api);
          const before = previousElementsRef.current;
          if (before.length) {
            const remap = <T,>(values?: Record<number, T>, previousElements = before, nextElements = nativeElements) => Object.fromEntries(Object.entries(values ?? {}).flatMap(([index, value]) => { const nextIndex = nextElements.indexOf(previousElements[Number(index)]); return nextIndex < 0 ? [] : [[nextIndex, value]]; })) as Record<number, T>;
            const current = settingsRef.current;
            const retainedOverrides = Object.fromEntries(Object.entries(current.sourceOverrides ?? {}).filter(([index]) => {
              const element = before[Number(index)], previous = sourceSnapshotsRef.current.get(element);
              return element && (previous === undefined || previous === element.exportElement());
            }));
            const remapIndex = (index?: number) => { const next = index === undefined ? -1 : nativeElements.indexOf(before[index]); return next < 0 ? undefined : next; };
            settingsRef.current = { ...current, sourceOverrides: remap(retainedOverrides), models: remap(current.models, previousAnalysisElementsRef.current, analysisElements), acSource: remapIndex(current.acSource), dcSource: remapIndex(current.dcSource) };
            setAnalysisSettings(settingsRef.current);
          }
          previousElementsRef.current = nativeElements;
          previousAnalysisElementsRef.current = analysisElements;
          sourceSnapshotsRef.current = new Map(nativeElements.map(element => [element, element.exportElement()]));
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
            const allNodes = circuitJsNodeOptions(nativeElements).filter((node) => node.id !== 0);
            const requested = recommendedKey.split('|').filter(Boolean);
            const recommended = requested.flatMap((name) => { const node = allNodes.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase()); return node ? [node] : []; });
            const nodeOptions = recommended.length ? recommended : allNodes.slice(0, 2);
            const defaults: CircuitJsProbe[] = nodeOptions.map((node, index) => ({ id: crypto.randomUUID(), name: `V(${node.name.includes('·') ? `node ${node.id}` : node.name})`, kind: 'voltage', element: node.element, post: node.post, color: CIRCUITJS_PROBE_COLORS[index], enabled: true }));
            probesRef.current = defaults; setProbes(defaults);
          }
          if (resumeLive) {
            try {
              if (api.getStopMessage()) throw new Error(api.getStopMessage()!);
              liveRef.current = startCircuitJsAcquisition(api, probesRef.current, { ...liveConfigRef.current, onError: (message) => { setError(message); setLive(false); } });
              setStatus('Live measurements restarted for the updated circuit.');
            } catch (cause) { setLive(false); setError(cause instanceof Error ? cause.message : 'Update the probes to resume live measurements.'); }
          }
        };
        api.importCircuit(neutralCircuitJsPresentation(starter), false);
        if (freshStarter) {
          api.compactComponentLeads?.();
          for (const [index, source] of Object.entries(settingsRef.current.sourceOverrides ?? {})) applyNativeSource(api, Number(index), source, settingsRef.current.duration);
        }
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
          probesRef.current = next; setProbes(next);
          if (liveRef.current && !liveRef.current.stopped) {
            liveRef.current.stop();
            try { liveRef.current = startCircuitJsAcquisition(api, next, { ...liveConfigRef.current, onError: (message) => { setError(message); setLive(false); } }); }
            catch (cause) { liveRef.current = null; setLive(false); setError(cause instanceof Error ? cause.message : 'Unable to update live probes.'); return; }
          }
          setError(null); setStatus(`${name} added.`);
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
      if (stop) { setError(stop); cancelCaptureRef.current?.(stop); if (liveRef.current) { liveRef.current.stop(); liveRef.current = null; setLive(false); } }
      if (liveRef.current && !liveRef.current.stopped && performance.now() - lastPublishedRef.current >= 500) {
        const result = liveRef.current.snapshot();
        if (result) { setPayload(result); setLiveDepth(result.x.length); }
        lastPublishedRef.current = performance.now();
      }
      const readings: Record<string, number> = {};
      probesRef.current.forEach((probe) => {
        readings[probe.id] = readCircuitJsProbe(probe);
      });
      setValues(readings);
    }, 150);
    return () => {
      mountedRef.current = false; clearInterval(timer); detach(); cancelCaptureRef.current?.();
      liveRef.current?.stop(); liveRef.current = null;
      if (apiRef.current) { apiRef.current.setSimRunning(false); apiRef.current.onanalyze = undefined; }
      apiRef.current = null;
    };
  }, [initialCircuit, storageKey, recommendedKey]);
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
    const saved: SavedCircuit = { version: 1, circuit, duration: Number(duration), samples: Number(samples), analysisSettings: settingsRef.current, probes: probesRef.current.map(({ element, ...probe }) => ({ ...probe, elementIndex: nativeElements.indexOf(element) })) };
    try { localStorage.setItem(`anacode:circuitjs:${storageKey}`, JSON.stringify(saved)); setStatus('Circuit and probes saved in this browser.'); }
    catch { setError('Browser storage is full or unavailable. Export the circuit to keep a copy.'); }
  }
  async function capture() {
    const api = apiRef.current; if (!api) return;
    try {
      setError(null); setCapturing(true); setCaptureProgress(0);
      const capture = captureCircuitJs(api, probesRef.current, Number(duration), Number(samples), { onProgress: progress => { if (mountedRef.current) setCaptureProgress(Math.min(100, Math.round(100 * progress.samples / progress.target))); } });
      cancelCaptureRef.current = capture.cancel;
      const result = await capture.result;
      if (!mountedRef.current) return;
      setPayload(result); setResultSource('circuit'); setTab('instruments'); setStatus(`Captured ${result.x.length.toLocaleString()} solver samples across ${result.traces.length} probes.`);
    } catch (cause) { if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Capture failed.'); }
    finally { cancelCaptureRef.current = null; if (mountedRef.current) setCapturing(false); }
  }
  const displayedPayload = resultSource === 'spice' ? spicePayload : payload;
  return <section className={styles.workbench} data-resizing={resizing || undefined} aria-label="CircuitJS schematic and simulation workspace">
    <div className={styles.toolbar}>
      <button type="button" aria-pressed={tab === 'editor'} onClick={() => navigate('editor')}><MousePointer2 size={16}/> Schematic</button>
      <button type="button" aria-pressed={tab === 'instruments'} onClick={() => navigate('instruments')}><Waves size={16}/> Oscilloscope &amp; FFT</button>
      {analysis && <button type="button" aria-label="SPICE & grading" onClick={() => navigate('analysis')}>SPICE &amp; grading</button>}
      <label className={styles.layoutControl}>Layout<select aria-label="Workspace layout" value={layout} onChange={(event) => setLayout(event.target.value as typeof layout)}><option value="tabs">Tabs</option><option value="stacked">Stacked</option><option value="split">Side by side</option></select></label>
      <span className={styles.spacer}/>
      <button type="button" disabled={!ready || capturing} onClick={() => { apiRef.current?.setSimRunning(!running); setRunning(!running); }}>{running ? <Pause size={15}/> : <Play size={15}/>} {running ? 'Pause' : 'Run'}</button>
      <button type="button" disabled={!ready || capturing} onClick={() => saveCircuit(false)}><Save size={15}/> Save</button>
      <button type="button" disabled={!ready || capturing} onClick={() => saveCircuit(true)}><Download size={15}/> Export</button>
      <button type="button" disabled={!ready || capturing} onClick={() => inputRef.current?.click()}><FolderOpen size={15}/> Open</button>
      <button type="button" disabled={!ready || capturing} onClick={restoreStarter}><RotateCcw size={15}/> Restore starter</button>
      <input ref={inputRef} type="file" accept=".txt,.circuitjs,.xml" hidden onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        try { if (file.size > 2_000_000) throw new Error('Choose a circuit smaller than 2 MB.'); const text = neutralCircuitJsPresentation(validateCircuitJsText(await file.text())); updateProbes([]); setPayload(null); previousElementsRef.current = []; settingsRef.current = { ...settingsRef.current, models: {}, sourceOverrides: {}, acSource: undefined, dcSource: undefined }; setAnalysisSettings(settingsRef.current); apiRef.current?.importCircuit(text, false); apiRef.current?.setSimRunning(true); setError(null); setStatus('Circuit imported.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.'); } event.target.value = '';
      }}/>
    </div>
    {modelNote && <details className={styles.wiringSteps}><summary>Model notes</summary><p>{modelNote}</p></details>}
    {wiringInstructions && <details className={styles.wiringSteps}><summary>Wiring guide</summary><ol>{wiringInstructions.map((step) => <li key={step}>{step}</li>)}</ol></details>}
    <div ref={bodyRef} className={styles.workspaceBody} data-layout={layout} style={{ "--editor-percent": `${editorPercent}%` } as CSSProperties}>
    <div ref={editorRef} className={styles.editorPane} hidden={layout === 'tabs' && tab !== 'editor'}>
      <KiCadSymbolPalette disabled={!ready || capturing} onAdd={(nativeType) => {
        changeMode('edit');
        apiRef.current?.addElement(nativeType);
        iframeRef.current?.contentWindow?.focus();
        setStatus('Click and drag in the schematic to place the component. Escape cancels placement.');
      }}/>
      <div className={styles.tools}>
        <button type="button" disabled={!ready} onClick={() => { changeMode('edit'); apiRef.current?.startWire(); iframeRef.current?.contentWindow?.focus(); setStatus('Click a terminal, then click to route the wire. Escape finishes.'); }}>Wire</button>
        <button type="button" aria-pressed={mode === 'edit'} onClick={() => {
          changeMode('edit');
          setStatus('Edit mode. Select or drag components in the schematic.');
        }}><MousePointer2 size={15}/> Edit</button>
        <button type="button" aria-pressed={mode === 'voltage'} onClick={() => changeMode('voltage')}><Radio size={15}/> Voltage probe</button>
        <button type="button" aria-pressed={mode === 'current'} onClick={() => changeMode('current')}><Radio size={15}/> Current probe</button>
        <label className={styles.schematicTheme}>Paper<select aria-label="Schematic theme" value={schematicTheme} onChange={event => { const next = event.target.value as typeof schematicTheme; setSchematicTheme(next); try { localStorage.setItem('anacode:workbench-layout', JSON.stringify({ editorPercent, editorHeight, probeHeight, schematicTheme: next })); } catch { /* Optional preference. */ } }}><option value="follow">Follow site</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <span className={styles.toolHint}>{mode === 'edit' ? 'W: wire · drag: move · double-click text: edit · Ctrl/Cmd + scroll: zoom' : 'Click a wire or terminal to add a channel.'}</span>
      </div>
      <div className={styles.frameWrap} data-schematic-theme={schematicTheme} style={{ height: editorHeight }}>
        <iframe ref={iframeRef} className={styles.frame} title="CircuitJS schematic editor" src="/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&usResistors=true&cct=%24%204%200.000001%2010%2050%205%2050%205e-11" allow="clipboard-read; clipboard-write"/>
        <SchematicProbeOverlay api={apiRef} frame={iframeRef} probes={probes}/>
      </div>
      <WorkspaceDivider label="Resize schematic height" orientation="horizontal" value={editorHeight} minimum={300} maximum={1200} defaultValue={640} step={30} onChange={value => { setEditorHeight(value); persistLayout({ editorHeight: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.horizontalDivider}/>
      <ReusableBlockLibrary api={nativeApi} challengeSlug={analysis?.challengeSlug} onCircuitChange={() => { setPayload(null); setSpicePayload(null); setStatus('Block selected. Place it in the schematic and connect its terminals.'); }}/>
    </div>
    {layout === 'split' && <WorkspaceDivider label="Resize schematic and instruments" orientation="vertical" value={editorPercent} minimum={30} maximum={75} defaultValue={56} unitsPerPixel={() => 100 / (bodyRef.current?.clientWidth || 1000)} onChange={value => { setEditorPercent(value); persistLayout({ editorPercent: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.verticalDivider}/>}
    <div ref={measurementRef} className={styles.measurementPane} hidden={layout === 'tabs' && tab !== 'instruments'}>
    <div className={styles.captureBar}>
      <button type="button" className={styles.liveButton} aria-pressed={live} disabled={!ready || capturing || !probes.some((probe) => probe.enabled)} onClick={() => { if (live) stopLive(); else startLive(); }}>{live ? 'Freeze measurements' : 'Start live measurements'}</button>
      {live && <output className={styles.liveStatus} aria-label="Live acquisition status">Live · {liveDepth.toLocaleString()} samples</output>}
      <button className={styles.capture} type="button" disabled={!ready || capturing || live || !probes.some((probe) => probe.enabled)} onClick={capture}><Waves size={17}/>{capturing ? 'Capturing… ' + captureProgress + '%' : 'Capture all probes'}</button>
      {capturing && <button type="button" onClick={() => cancelCaptureRef.current?.()}>Cancel</button>}
    </div>
    <div ref={instrumentRef} className={styles.instruments}>
      {spicePayload && <div className={styles.sourceSwitch}><button type="button" aria-pressed={resultSource === 'circuit'} onClick={() => setResultSource('circuit')}>Circuit probes</button><button type="button" aria-pressed={resultSource === 'spice'} onClick={() => setResultSource('spice')}>SPICE response</button></div>}
      {displayedPayload && displayedPayload.warnings.map((warning) => <p className={styles.note} key={warning}>{warning}</p>)}
      {displayedPayload ? <ScopeResult payload={displayedPayload} preferredInstrument={preferredInstrument ?? (Object.values(analysisSettings.sourceOverrides ?? {}).some(source => source.type === 'bitstream') ? 'logic' : 'scope')}/> : <div className={styles.empty}><Waves size={30}/><strong>Watch your circuit respond</strong><p>Choose live measurements for a moving trace, or capture a record to inspect voltage, current, spectrum, and digital states.</p></div>}</div>
    {analysis && <div ref={analysisRef} className={styles.analysisPane}>
      <SimulationConsole {...analysis} prepareCircuit={prepareCircuit} prepareGrading={analysis.judge ? prepareGrading : undefined} onResult={acceptSpiceResult} hideWaveforms compact invalidationKey={JSON.stringify([circuitVersion, analysisSettings, duration, samples])}
        settingsSlot={<NativeAnalysisControls api={nativeApi} settings={{ ...analysisSettings, duration: Number(duration), samples: Number(samples) }} onChange={setAnalysisSettings} onApplySource={applySource}/>}/>
      {modelNotes.map(note => <p className={styles.note} key={note}>{note}</p>)}
    </div>}
    {designChecks?.length ? <DesignCheckPanel checks={designChecks} result={spicePayload}/> : null}
    <details className={styles.probeDetails}><summary>Probes &amp; capture settings <span>{probes.length} channels · {Number(samples).toLocaleString()} samples</span></summary>
    <div className={styles.probeScroll} style={{ height: probeHeight }}>
      <div className={styles.captureSettings}>      <label>Duration (seconds)<input aria-label="Capture duration in seconds" disabled={live || capturing} type="number" min="0.000000001" max="10" step="any" value={duration} onChange={(event) => setDuration(event.target.value)}/></label>
      <label>Target samples<select aria-label="Capture target samples" disabled={live || capturing} value={samples} onChange={(event) => setSamples(event.target.value)}>{[...new Set([...ACQUISITION_SAMPLE_OPTIONS, Number(samples)])].sort((a, b) => a - b).map((count) => <option key={count}>{count}</option>)}</select></label>
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
    </div>
    <WorkspaceDivider label="Resize probe settings" orientation="horizontal" value={probeHeight} minimum={120} maximum={600} defaultValue={210} step={20} onChange={value => { setProbeHeight(value); persistLayout({ probeHeight: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.horizontalDivider}/>
    </details>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.status} role="status">{status}</p>
    </div>
    </div>
  </section>;
}
