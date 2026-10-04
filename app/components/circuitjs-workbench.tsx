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
import { clearProbeAttachment, currentProbeElementAt, probeAttachment, probeNodeName, probePayloadAppearance, spiceProbeMatches, spiceProbePayloadAppearance } from '../../lib/circuitjs-probes';
import { formatEngineering } from '../../lib/engineering';
import { InlineColorPicker } from './color-picker';
import { probeCursor } from '../../lib/probe-cursor';
import { NativeColorPickerBridge } from './native-color-picker-bridge';
import type { CaptureRequest } from './instrument-state';
type CircuitWindow = Window & { CircuitJS1?: CircuitJsApi };
type SavedProbe = Omit<CircuitJsProbe, 'element'> & { elementIndex: number };
type SavedCircuit = { version: 1; circuit: string; probes: SavedProbe[]; duration?: number; samples?: number; analysisSettings?: NativeAnalysisSettings; starterRevision?: string };
const starterRevision = (text: string) => { let hash = 2166136261; for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); return (hash >>> 0).toString(16); };
type AnalysisConfig = { initialNetlist: string; probe?: string | readonly string[]; challengeSlug?: string; judge?: JudgeKind; requireSchematic?: boolean };
export function CircuitJsWorkbench({ fillWindow = false, initialCircuit = CIRCUITJS_LAB_STARTER, storageKey = 'lab', modelNote, onPrepareGrading, analysis, recommendedProbes, wiringInstructions, analysisDefaults, preferredInstrument, designChecks, acquisitionMode }: { fillWindow?: boolean; initialCircuit?: string; storageKey?: string; modelNote?: string; onPrepareGrading?: (document: CircuitDocument, deck: string) => void; analysis?: AnalysisConfig; recommendedProbes?: readonly string[]; wiringInstructions?: readonly string[]; analysisDefaults?: Partial<NativeAnalysisSettings>; preferredInstrument?: 'scope' | 'logic' | 'dc'; designChecks?: readonly DesignCheck[]; acquisitionMode?: 'restart-record' | 'live' }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<CircuitJsApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probesRef = useRef<CircuitJsProbe[]>([]);
  const modeRef = useRef<'edit' | 'voltage' | 'current'>('edit');
  const cancelCaptureRef = useRef<((message?: string) => void) | null>(null);
  const restoredProbesRef = useRef<SavedProbe[] | null>(null);
  const mountedRef = useRef(true);
  const liveRef = useRef<CircuitJsAcquisition | null>(null);
  const liveConfigRef = useRef({ duration: 0.01, samples: 65536, restart: true, record: false, onComplete: () => {} });
  const initialRecordRef = useRef(false);
  const captureRef = useRef<() => void>(() => {});
  const lastPublishedRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [nativeApi, setNativeApi] = useState<CircuitJsApi | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Loading the CircuitJS editor…');
  const [error, setError] = useState<string | null>(null);
  const [elements, setElements] = useState<CircuitJsElement[]>([]);
  const [probes, setProbes] = useState<CircuitJsProbe[]>([]);
  const [selectedProbeId, setSelectedProbeId] = useState<string | null>(null);
  const [selectedSpiceTraceId, setSelectedSpiceTraceId] = useState<string | null>(null);
  const [instrumentView, setInstrumentView] = useState<'scope' | 'spectrum' | 'logic' | 'dc' | 'all'>(preferredInstrument === 'dc' ? 'dc' : 'scope');
  const [fftLength, setFftLength] = useState<number | undefined>();
  const [spiceRunRequest, setSpiceRunRequest] = useState(0);
  const [spiceRunning, setSpiceRunning] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'edit' | 'voltage' | 'current'>('edit');
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedCurrent, setSelectedCurrent] = useState('');
  const defaultDuration = analysisDefaults?.duration !== undefined ? String(analysisDefaults.duration) : storageKey === 'mosfet-gate-drive' ? '0.000004' : storageKey === 'transimpedance-stability' ? '0.00002' : '0.01';
  const defaultSamples = String(analysisDefaults?.samples ?? 65536);
  const [duration, setDuration] = useState(defaultDuration);
  const [samples, setSamples] = useState(defaultSamples);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [timeControlsOpen, setTimeControlsOpen] = useState(true);
  const [payload, setPayload] = useState<SimulationPayload | null>(null);
  const [tab, setTab] = useState<'editor' | 'instruments' | 'analysis'>('instruments');
  const [layout, setLayout] = useState<'tabs' | 'stacked' | 'split'>('split');
  const [live, setLive] = useState(false);
  const [liveDepth, setLiveDepth] = useState(0);
  const [spicePayload, setSpicePayload] = useState<SimulationPayload | null>(null);
  const [resultSource, setResultSource] = useState<'circuit' | 'spice'>('circuit');
  const [modelNotes, setModelNotes] = useState<string[]>([]);
  const [instrumentMaximized, setInstrumentMaximized] = useState(false);
  const [captureOrigin, setCaptureOrigin] = useState<'restart' | 'continue'>('restart');
  const [liveMode, setLiveMode] = useState<'record' | 'continuous'>(acquisitionMode === 'live' ? 'continuous' : 'record');
  const [labelEditor, setLabelEditor] = useState(false);
  const [netName, setNetName] = useState('');
  const [netStyle, setNetStyle] = useState<'plain' | 'flag'>('plain');
  const [updatedStarter, setUpdatedStarter] = useState(false);
  const currentStarterRevision = starterRevision(JSON.stringify({ circuit: initialCircuit, analysisDefaults, preferredInstrument, acquisitionMode }));
  const instrumentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const probeDetailsRef = useRef<HTMLDetailsElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editorPercent, setEditorPercent] = useState(56);
  const [editorHeight, setEditorHeight] = useState(640);
  const [probeHeight, setProbeHeight] = useState(210);
  const [resizing, setResizing] = useState(false);
  const [schematicTheme, setSchematicTheme] = useState<'follow' | 'light' | 'dark'>('follow');
  const themeRef = useRef(schematicTheme);
  const [analysisSettings, setAnalysisSettings] = useState<NativeAnalysisSettings>({ type: analysis?.initialNetlist.match(/^\s*\.ac\b/m) ? 'ac-sweep' : analysis?.initialNetlist.match(/^\s*\.op\b/m) ? 'operating-point' : 'transient', duration: .01, samples: 65536, startHz: 10, stopHz: 100000, dcStart: 0, dcStop: 5, dcStep: .05, ...analysisDefaults });
  const settingsRef = useRef(analysisSettings);
  const spiceCurrentBindingsRef = useRef<{element:CircuitJsElement;expression:string}[]>([]);
  const [spiceLinked, setSpiceLinked] = useState(false);
  const previousElementsRef = useRef<CircuitJsElement[]>([]);
  const previousAnalysisElementsRef = useRef<CircuitJsElement[]>([]);
  const revisionRef = useRef<number | undefined>(undefined);
  const sourceSnapshotsRef = useRef(new Map<CircuitJsElement, string>());
  const [circuitVersion, setCircuitVersion] = useState(0);
  const nodes = circuitJsNodeOptions(elements);
  const recommendedKey = recommendedProbes?.join('|') ?? '';
  const acceptSpiceResult = useCallback((result: SimulationPayload | null, source?: 'schematic'|'deck') => {
    setSpicePayload(result && source==='schematic' && apiRef.current ? spiceProbePayloadAppearance(result,probesRef.current,apiRef.current,spiceCurrentBindingsRef.current) : result);
    setSpiceLinked(source === 'schematic');
    if (result) { setResultSource('spice'); setTab('instruments'); setInstrumentMaximized(false); setStatus(`${result.analysis === 'ac' ? 'AC response' : result.analysis === 'dc-sweep' ? 'DC sweep' : result.analysis === 'dc' ? 'DC operating point' : 'Transient response'} ready above.`); }
  }, []);
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
  function changeAnalysis(next: NativeAnalysisSettings) {
    const changed = next.type !== settingsRef.current.type;
    settingsRef.current = next;
    setAnalysisSettings(next);
    if (changed) {
      stopLive(); setSpicePayload(null); setInstrumentMaximized(false); setTab('instruments');
      setTimeControlsOpen(next.type === 'transient');
      setResultSource(next.type === 'transient' ? 'circuit' : 'spice');
    }
  }
  function runAnalysis() {
    if (!ready || capturing || spiceRunning || !analysis) return;
    stopLive(); setError(null); setResultSource('spice'); setInstrumentMaximized(false); setTab('instruments');
    if (settingsRef.current.type !== 'transient') setTimeControlsOpen(false);
    setSpiceRunRequest(value => value + 1);
  }
  function startLive() {
    const api = apiRef.current; if (!api) return;
    initialRecordRef.current = true;
    liveRef.current?.stop();
    try {
      const connectionError = api.ensureAnalyzed?.();
      if (connectionError) throw new Error('Fix the schematic before measuring: ' + connectionError);
      liveConfigRef.current = { duration: Number(duration), samples: Number(samples), restart: captureOrigin === 'restart', record: liveMode === 'record', onComplete: () => {
        const result = liveRef.current?.snapshot(); if (result) setPayload(result);
        setLive(false); setStatus('Record complete. All instruments show the same captured time window.');
      } };
      liveRef.current = startCircuitJsAcquisition(api, probesRef.current, { ...liveConfigRef.current, onError: (message) => { if (mountedRef.current) { setError(message); setLive(false); } } });
      setLive(true); setResultSource('circuit'); setError(null); setStatus(liveMode === 'record' ? 'Recording from the selected start through the requested duration.' : 'Live measurements are following your circuit. Freeze to inspect a record.');
    } catch (cause) { liveRef.current = null; setLive(false); setError(cause instanceof Error ? cause.message : 'Unable to start measurements.'); }
  }
  function updateProbes(next: CircuitJsProbe[]) {
    const wasLive = Boolean(liveRef.current && !liveRef.current.stopped);
    const changed = next.length !== probesRef.current.length || next.some((probe, index) => { const previous = probesRef.current[index]; return !previous || probe.id !== previous.id || probe.element !== previous.element || probe.post !== previous.post || probe.kind !== previous.kind || probe.enabled !== previous.enabled; });
    probesRef.current = next; setProbes(next);
    liveRef.current?.updateAppearance(next);
    setPayload(previous => changed ? null : previous ? probePayloadAppearance(previous, next) : previous);
    setSpicePayload(previous=>previous && spiceLinked && apiRef.current ? spiceProbePayloadAppearance(previous,next,apiRef.current,spiceCurrentBindingsRef.current) : previous);
    if (wasLive && changed) startLive();
  }
  function prepareGrading() {
    const api = apiRef.current; if (!api) throw new Error('Wait for the circuit to load.');
    const connectionError = api.ensureAnalyzed?.();
    if (connectionError) throw new Error('Fix the schematic before grading: ' + connectionError);
    const document = circuitJsGradingDocument(api, storageKey);
    const generated = generateSpiceDeckFromCircuitDocument(document);
    onPrepareGrading?.(document, generated.deck);
    return document;
  }
  function prepareCircuit() {
    const api = apiRef.current; if (!api) throw new Error('Wait for the circuit to load.');
    const connectionError = api.ensureAnalyzed?.();
    if (connectionError) throw new Error('Fix the schematic before analysis: ' + connectionError);
    if (analysis?.requireSchematic) prepareGrading();
    const prepared = circuitJsAnalysis(api, { ...settingsRef.current, acSource: settingsRef.current.acSource ?? circuitJsAnalysisOptions(api).sources[0]?.index, duration: Number(duration), samples: Number(samples) });
    spiceCurrentBindingsRef.current = prepared.currentBindings;
    const currents = probesRef.current.filter(probe=>probe.enabled && probe.kind==='current').map(probe=>{
      const binding=prepared.currentBindings.find(binding=>binding.element===probe.element);
      if (!binding) throw new Error('SPICE current probes require a voltage source or inductor. Use Capture all probes for other component currents.');
      return binding.expression;
    });
    setModelNotes(prepared.notes);
    return { ...prepared, probes: [...new Set([...prepared.probes,...currents])], invalidationKey: JSON.stringify([api.getCircuitRevision?.() ?? circuitVersion, settingsRef.current, duration, samples]) };
  }
  function currentInvalidationKey() { return JSON.stringify([apiRef.current?.getCircuitRevision?.() ?? circuitVersion, settingsRef.current, duration, samples]); }
  function applySource(index: number, source: NativeSourceOverride | undefined, expectedElement?: CircuitJsElement) {
    const api = apiRef.current; if (!api) throw new Error('Wait for the schematic to load.');
    // Refresh index-based model settings while allowing source edits to repair
    // a circuit whose present parameters cannot yet be simulated.
    api.ensureAnalyzed?.();
    if (expectedElement) {
      index = api.getElements().indexOf(expectedElement);
      if (index < 0) throw new Error('This source was removed. Select a source in the current schematic.');
    }
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
    const canvas = iframeRef.current?.contentDocument?.querySelector('canvas');
    if (canvas) canvas.style.cursor = next === 'edit' ? '' : probeCursor(next);
    if (next !== 'edit') setStatus('Click once on any wire or terminal. Drag a probe grip to move it; Escape returns to editing.');
  }
  function restoreStarter() {
    const api = apiRef.current; if (!api) return;
    stopLive(); initialRecordRef.current = false;
    setUpdatedStarter(false);
    setDuration(defaultDuration); setSamples(defaultSamples); setCaptureOrigin('restart');
    updateProbes([]); setPayload(null); setSpicePayload(null); previousElementsRef.current = [];
    settingsRef.current = { ...settingsRef.current, models: {}, sourceOverrides: {}, acSource: undefined, dcSource: undefined, settleDuration: 0, ...analysisDefaults };
    setAnalysisSettings(settingsRef.current);
    api.importCircuit(neutralCircuitJsPresentation(initialCircuit), false); api.compactComponentLeads?.();
    try {
      for (const [index, source] of Object.entries(settingsRef.current.sourceOverrides ?? {})) applyNativeSource(api, Number(index), source, Number(defaultDuration));
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
    const attachment = kind === 'voltage' ? clearProbeAttachment(apiRef.current!.getElements(), element, post) : { element, post };
    updateProbes([...current, { id: crypto.randomUUID(), name, kind, ...attachment, color: CIRCUITJS_PROBE_COLORS[current.length % CIRCUITJS_PROBE_COLORS.length], enabled: true }]);
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
            setUpdatedStarter(saved.starterRevision !== currentStarterRevision);
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
          setPayload(null);
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
              return [{ ...probe, id: typeof probe.id === 'string' ? probe.id : crypto.randomUUID(), name: String(probe.name).slice(0, 80), color: /^#[a-f\d]{6}$/i.test(probe.color) ? probe.color : CIRCUITJS_PROBE_COLORS[0], element, enabled: probe.enabled !== false,
                anchorFraction: Number.isFinite(probe.anchorFraction) ? Math.max(0, Math.min(1, probe.anchorFraction!)) : undefined,
                markerOffset: probe.markerOffset && Number.isFinite(probe.markerOffset.x) && Number.isFinite(probe.markerOffset.y) ? { x: Math.max(-200, Math.min(200, probe.markerOffset.x)), y: Math.max(-200, Math.min(200, probe.markerOffset.y)) } : undefined }];
            });
            restoredProbesRef.current = null;
            probesRef.current = restored; setProbes(restored);
          } else if (previous.length) { probesRef.current = previous; setProbes(previous); }
          else {
            const allNodes = circuitJsNodeOptions(nativeElements).filter((node) => node.id !== 0);
            const requested = recommendedKey.split('|').filter(Boolean);
            const recommended = requested.flatMap((name) => { const node = allNodes.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase()); return node ? [node] : []; });
            const inputs = allNodes.filter(node => /^(vin|in|input|bits|clk|clock)$/i.test(node.name) && !recommended.some(candidate => candidate.id === node.id));
            const nodeOptions = recommended.length ? [...inputs, ...recommended].slice(0, MAX_CIRCUITJS_PROBES) : allNodes.slice(0, 2);
            const defaults: CircuitJsProbe[] = nodeOptions.map((node, index) => ({ id: crypto.randomUUID(), name: `V(${node.name.includes('·') ? `node ${node.id}` : node.name})`, kind: 'voltage', ...clearProbeAttachment(nativeElements, node.element, node.post), color: CIRCUITJS_PROBE_COLORS[index], enabled: true }));
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
          if (event.target !== nativeDocument.querySelector('canvas')) return;
          if (event.type === 'mousedown') { setSelectedProbeId(null); setSelectedSpiceTraceId(null); }
          if (modeRef.current === 'edit') return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.type !== 'mousedown' || cancelCaptureRef.current) return;
          const canvas = event.target as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          const hit = api.hitTest?.(event.clientX - rect.left, event.clientY - rect.top);
          const element = modeRef.current === 'current' ? currentProbeElementAt(api, event.clientX - rect.left, event.clientY - rect.top) : hit?.element;
          if (!element || element.getPostCount() < 1) { setStatus('Click a wire or component terminal to place a probe.'); return; }
          const post = hit?.element === element ? hit.post : 0;
          // Native hit testing identifies the wire; all its terminals share one solved node.
          const current = probesRef.current;
          const kind = modeRef.current;
          if (kind === 'current' && !supportsCircuitJsCurrent(element)) { setError('Click a scalar wire or a two-terminal component to measure its branch current.'); return; }
          if (current.length >= MAX_CIRCUITJS_PROBES) { setError('A maximum of 32 probes is supported.'); return; }
          if (current.some((probe) => probe.kind === kind && (kind === 'current' ? probe.element === element : probe.element.getNodeId(probe.post) === element.getNodeId(post)))) { setStatus('That node already has a probe. Drag its colored grip to reposition it.'); return; }
          const index = api.getElements().indexOf(element);
          const label = probeNodeName(api, element, post);
          const name = kind === 'voltage' ? `V(${label})` : `I(${circuitJsElementName(element, index)})`;
          const next = [...current, { id: crypto.randomUUID(), name, kind, ...probeAttachment(element, post, hit?.x, hit?.y, hit?.pathFraction), color: CIRCUITJS_PROBE_COLORS[current.length % CIRCUITJS_PROBE_COLORS.length], enabled: true }];
          probesRef.current = next; setProbes(next); setPayload(null);
          if (liveRef.current && !liveRef.current.stopped) {
            liveRef.current.stop();
            try { liveRef.current = startCircuitJsAcquisition(api, next, { ...liveConfigRef.current, onError: (message) => { setError(message); setLive(false); } }); }
            catch (cause) { liveRef.current = null; setLive(false); setError(cause instanceof Error ? cause.message : 'Unable to update live probes.'); return; }
          }
          setError(null); setStatus(`${name} added.`);
        };
        const events = ['mousedown', 'mouseup', 'click'] as const;
        const escape = (event: KeyboardEvent) => {
          if (event.key === 'Escape') { setSelectedProbeId(null); setSelectedSpiceTraceId(null); modeRef.current = 'edit'; setMode('edit'); const canvas = nativeDocument.querySelector('canvas'); if (canvas) canvas.style.cursor = ''; }
          if (modeRef.current !== 'edit' || event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
          if ((event.target as Element | null)?.closest?.('input,textarea,select,[contenteditable=true]')) return;
          const label = api.getHoveredElement(), angle = label?.getLabelAngle?.();
          if (label?.getType() !== 'LabeledNodeElm' || angle === null || angle === undefined || !label.setLabelAngle) return;
          event.preventDefault(); event.stopImmediatePropagation();
          const issue = label.setLabelAngle(angle + (event.shiftKey ? -90 : 90));
          if (issue) setError(issue); else setStatus('Net label rotated. R rotates clockwise; Shift+R rotates back.');
        };
        // detach() removes this listener together with the native click handlers.
        // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
        nativeDocument.addEventListener('keydown', escape, true);
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
          nativeDocument.removeEventListener('keydown', escape, true);
        };
        setReady(true); setStatus('Editor ready. Draw circuits, choose any node, and capture multiple probes.');
      }
      setRunning(api.isRunning());
      const stop = api.getStopMessage();
      if (!initialRecordRef.current && api.resetSimulation && probesRef.current.some(probe => probe.enabled) && !stop) { initialRecordRef.current = true; captureRef.current(); }
      if (stop) { setError(stop); cancelCaptureRef.current?.(stop); if (liveRef.current) { liveRef.current.stop(); liveRef.current = null; setLive(false); } }
      if (liveRef.current && !liveRef.current.stopped && performance.now() - lastPublishedRef.current >= 500) {
        const result = liveRef.current.snapshot();
        if (result) { setPayload(result); setLiveDepth(result.x.length); }
        lastPublishedRef.current = performance.now();
      }
      if (probeDetailsRef.current?.open) {
        const readings = Object.fromEntries(probesRef.current.map(probe => [probe.id, readCircuitJsProbe(probe)]));
        setValues(previous => Object.keys(previous).length === Object.keys(readings).length && Object.entries(readings).every(([id, value]) => Object.is(previous[id], value)) ? previous : readings);
      }
    }, 150);
    return () => {
      mountedRef.current = false; clearInterval(timer); detach(); cancelCaptureRef.current?.();
      liveRef.current?.stop(); liveRef.current = null;
      if (apiRef.current) { apiRef.current.setSimRunning(false); apiRef.current.onanalyze = undefined; }
      apiRef.current = null;
    };
  }, [initialCircuit, storageKey, recommendedKey, currentStarterRevision]);
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
    const saved: SavedCircuit = { version: 1, circuit, starterRevision: currentStarterRevision, duration: Number(duration), samples: Number(samples), analysisSettings: settingsRef.current, probes: probesRef.current.map(({ element, ...probe }) => ({ ...probe, elementIndex: nativeElements.indexOf(element) })) };
    try { localStorage.setItem(`anacode:circuitjs:${storageKey}`, JSON.stringify(saved)); setStatus('Circuit and probes saved in this browser.'); }
    catch { setError('Browser storage is full or unavailable. Export the circuit to keep a copy.'); }
  }
  async function capture(record = { duration: Number(duration), samples: Number(samples), settleDuration: settingsRef.current.settleDuration ?? 0 }) {
    const api = apiRef.current; if (!api) return;
    if (cancelCaptureRef.current) return;
    initialRecordRef.current = true;
    try {
      setError(null); setCapturing(true); setCaptureProgress(0); setStatus('Capturing all enabled probes…');
      stopLive();
      const connectionError = api.ensureAnalyzed?.();
      if (connectionError) throw new Error('Fix the schematic before capturing: ' + connectionError);
      const capture = captureCircuitJs(api, probesRef.current, record.duration, record.samples, { restart: captureOrigin === 'restart', settleDuration: record.settleDuration, onProgress: progress => { if (mountedRef.current) setCaptureProgress(Math.min(100, Math.round(100 * progress.time / (record.duration + record.settleDuration)))); } });
      cancelCaptureRef.current = capture.cancel;
      const result = await capture.result;
      if (!mountedRef.current) return;
      setPayload(probePayloadAppearance(result, probesRef.current)); setResultSource('circuit'); setTab('instruments'); setStatus(`Captured ${result.x.length.toLocaleString()} solver samples across ${result.traces.length} probes.`);
    } catch (cause) { if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Capture failed.'); }
    finally { cancelCaptureRef.current = null; if (mountedRef.current) setCapturing(false); }
  }
  const displayedPayload = resultSource === 'spice' ? spicePayload : payload;
  const analysisAction = ({ 'ac-sweep': 'Run AC sweep', 'dc-sweep': 'Run DC sweep', 'operating-point': 'Measure DC operating point', transient: 'Run transient analysis' } as const)[analysisSettings.type];
  const resultName = (result: SimulationPayload) => result.analysis === 'ac' ? 'AC frequency response' : result.analysis === 'dc-sweep' ? 'DC transfer curve' : result.analysis === 'dc' ? 'DC operating point' : 'Time capture';
  const normalizeNode = (name: string) => name.toLowerCase().replace(/^∠?v\((.*)\)$/, '$1').replace(/^node\s+/, 'node');
  const resultTraces = (result: SimulationPayload) => [...result.traces, ...result.operatingPoint.map(point => ({ ...point, id: point.name, node: point.name, quantity: /^i\(/i.test(point.name) || point.unit==='A' ? 'current' : 'voltage', color: undefined }))];
  const traceForProbe = (probe: CircuitJsProbe, result: SimulationPayload | null) => {
    if (!result) return undefined;
    if (result.engine === 'circuitjs1') return result.traces.find(trace => trace.id === probe.id);
    if (!spiceLinked || !apiRef.current) return undefined;
    const api=apiRef.current;
    return resultTraces(result).find(trace=>spiceProbeMatches(probe,trace,api,spiceCurrentBindingsRef.current));
  };
  const selectProbe = (id: string) => {
    setSelectedProbeId(id);
    const probe = probesRef.current.find(probe => probe.id === id);
    setSelectedSpiceTraceId(probe ? traceForProbe(probe, spicePayload)?.id ?? null : null);
  };
  const selectTrace = (id: string | null) => {
    setSelectedSpiceTraceId(resultSource === 'spice' ? id : null);
    if (!id) { setSelectedProbeId(null); return; }
    if(resultSource==='spice' && !spiceLinked) { setSelectedProbeId(null); return; }
    const trace = displayedPayload ? resultTraces(displayedPayload).find(trace=>trace.id===id) : undefined, api=apiRef.current;
    const probe = probesRef.current.find(probe => probe.id === id || (api && trace && resultSource==='spice' && spiceProbeMatches(probe,trace,api,spiceCurrentBindingsRef.current)));
    if (probe) { if (!probe.enabled) updateProbes(probesRef.current.map(candidate=>candidate.id===probe.id?{...candidate,enabled:true}:candidate)); setSelectedProbeId(probe.id); return; }
    if (!api || !trace || capturing) { setSelectedProbeId(null); return; }
    if(/^i\(/i.test((trace.node??trace.name).replace(/^∠/,''))) {
      const binding=spiceCurrentBindingsRef.current.find(binding=>binding.expression.toLowerCase()===(trace.node??trace.name).replace(/^∠/,'').toLowerCase());
      if(!binding || !supportsCircuitJsCurrent(binding.element) || probesRef.current.length>=MAX_CIRCUITJS_PROBES) {setSelectedProbeId(null);return;}
      const added:CircuitJsProbe={id:crypto.randomUUID(),name:`I(${circuitJsElementName(binding.element,api.getElements().indexOf(binding.element))})`,kind:'current',element:binding.element,post:0,color:trace.color??CIRCUITJS_PROBE_COLORS[probesRef.current.length%CIRCUITJS_PROBE_COLORS.length],enabled:true};
      updateProbes([...probesRef.current,added]);setSelectedProbeId(added.id);return;
    }
    const node = circuitJsNodeOptions(api.getElements()).find(node => normalizeNode(probeNodeName(api, node.element, node.post)) === normalizeNode(trace.node ?? trace.name));
    if (!node || probesRef.current.length >= MAX_CIRCUITJS_PROBES) { setSelectedProbeId(null); return; }
    const added: CircuitJsProbe = { id: crypto.randomUUID(), name: `V(${probeNodeName(api,node.element,node.post)})`, kind:'voltage', ...clearProbeAttachment(api.getElements(),node.element,node.post), color: trace.color ?? CIRCUITJS_PROBE_COLORS[probesRef.current.length % CIRCUITJS_PROBE_COLORS.length], enabled:true };
    updateProbes([...probesRef.current, added]); setSelectedProbeId(added.id);
  };
  const selectedTraceId = resultSource === 'spice' ? selectedSpiceTraceId : selectedProbeId;
  function recordWithSettings(record: {duration:number;samples:number;settleDuration?:number}) {
    if (capturing || spiceRunning || live) return;
    const settleDuration = record.settleDuration ?? settingsRef.current.settleDuration ?? 0;
    if (!Number.isFinite(record.duration) || !Number.isFinite(settleDuration) || settleDuration < 0 || record.duration + settleDuration > 10) { setError('The capture and settling time together must be at most 10 seconds.'); return; }
    settingsRef.current = { ...settingsRef.current, settleDuration };
    setAnalysisSettings(settingsRef.current);
    setDuration(String(record.duration)); setSamples(String(record.samples));
    if (resultSource === 'spice' && analysis) setSpiceRunRequest(value => value + 1);
    else void capture({ ...record, settleDuration });
  }
  function requestFftCapture(request: CaptureRequest) {
    setFftLength(request.fftLength); setInstrumentView('spectrum');
    setStatus(request.reason);
    recordWithSettings({ duration: request.recordDuration ?? Number(duration), samples: Math.min(131072, request.recordDuration !== undefined ? request.minimumSamples : Math.max(Number(samples), request.minimumSamples)), settleDuration: request.settleDuration });
  }
  useEffect(() => { captureRef.current = () => { void capture(); }; });
  return <section className={styles.workbench} data-fill-window={fillWindow || undefined} data-resizing={resizing || undefined} aria-label="CircuitJS schematic and simulation workspace">
    <NativeColorPickerBridge frame={iframeRef} ready={ready}/>
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
    {updatedStarter && <div className={styles.starterNotice}><span>An updated starter is available. Your saved circuit is open.</span><button type="button" disabled={!ready || capturing} onClick={restoreStarter}>Load updated starter</button><button type="button" onClick={() => setUpdatedStarter(false)}>Keep my circuit</button></div>}
    {modelNote && <details className={styles.wiringSteps}><summary>Model notes</summary><p>{modelNote}</p></details>}
    {wiringInstructions && <details className={styles.wiringSteps}><summary>Wiring guide</summary><ol>{wiringInstructions.map((step) => <li key={step}>{step}</li>)}</ol></details>}
    <div ref={bodyRef} className={styles.workspaceBody} data-layout={instrumentMaximized ? 'tabs' : layout} data-instrument-maximized={instrumentMaximized || undefined} style={{ "--editor-percent": `${editorPercent}%` } as CSSProperties}>
    <div ref={editorRef} className={styles.editorPane} hidden={instrumentMaximized || (layout === 'tabs' && tab !== 'editor')}>
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
        <button type="button" disabled={!ready || capturing} aria-pressed={mode === 'voltage'} onClick={() => changeMode('voltage')}><Radio size={15}/> Voltage probe</button>
        <button type="button" disabled={!ready || capturing} aria-pressed={mode === 'current'} onClick={() => changeMode('current')}><Radio size={15}/> Current probe</button>
        <button type="button" aria-expanded={labelEditor} disabled={!ready || capturing} onClick={() => setLabelEditor(value => !value)}>Net label</button>
        <label className={styles.schematicTheme}>Paper<select aria-label="Schematic theme" value={schematicTheme} onChange={event => { const next = event.target.value as typeof schematicTheme; setSchematicTheme(next); try { localStorage.setItem('anacode:workbench-layout', JSON.stringify({ editorPercent, editorHeight, probeHeight, schematicTheme: next })); } catch { /* Optional preference. */ } }}><option value="follow">Follow site</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <span className={styles.toolHint}>{mode === 'edit' ? 'W: wire · drag text: move · double-click: edit · R over label: rotate · Ctrl/⌘ + scroll: zoom' : 'Place the probe tip on a wire or terminal · repeat for more channels · Esc: finish'}</span>
      </div>
      {labelEditor && <form className={styles.netLabelEditor} onSubmit={event => { event.preventDefault(); const name = netName.trim(); if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) { setError('Use a net name starting with a letter, up to 32 letters, digits or underscores.'); return; } changeMode('edit'); const issue = apiRef.current?.addNetLabel?.(name, netStyle); if (issue) { setError(issue); return; } iframeRef.current?.contentWindow?.focus(); setLabelEditor(false); setError(null); setStatus('Place the label on a wire endpoint or terminal. Equal names connect electrically throughout this circuit.'); }}><label>Net name<input aria-label="Global net name" value={netName} onChange={event => setNetName(event.target.value)} maxLength={32} placeholder="VREF" required/></label><label>Style<select aria-label="Net label style" value={netStyle} onChange={event => setNetStyle(event.target.value as typeof netStyle)}><option value="plain">Tag</option><option value="flag">Flag</option></select></label><button type="submit">Place label</button><button type="button" onClick={() => setLabelEditor(false)}>Cancel</button></form>}
      <div className={styles.frameWrap} data-schematic-theme={schematicTheme} style={{ height: editorHeight }}>
        <iframe ref={iframeRef} className={styles.frame} title="CircuitJS schematic editor" src="/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&usResistors=true&cct=%24%204%200.000001%2010%2050%205%2050%205e-11" allow="clipboard-read; clipboard-write"/>
        <SchematicProbeOverlay api={apiRef} frame={iframeRef} probes={probes} disabled={capturing} onChange={updateProbes} onMessage={setStatus} selectedProbeId={selectedProbeId} onSelectProbe={selectProbe}/>
      </div>
      <WorkspaceDivider label="Resize schematic height" orientation="horizontal" value={editorHeight} minimum={300} maximum={1200} defaultValue={640} step={30} onChange={value => { setEditorHeight(value); persistLayout({ editorHeight: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.horizontalDivider}/>
      <ReusableBlockLibrary api={nativeApi} challengeSlug={analysis?.challengeSlug} onCircuitChange={() => { setPayload(null); setSpicePayload(null); setStatus('Block selected. Place it in the schematic and connect its terminals.'); }}/>
    </div>
    {layout === 'split' && !instrumentMaximized && <WorkspaceDivider label="Resize schematic and instruments" orientation="vertical" value={editorPercent} minimum={30} maximum={75} defaultValue={56} unitsPerPixel={() => 100 / (bodyRef.current?.clientWidth || 1000)} onChange={value => { setEditorPercent(value); persistLayout({ editorPercent: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.verticalDivider}/>}
    <div ref={measurementRef} className={styles.measurementPane} hidden={!instrumentMaximized && layout === 'tabs' && tab !== 'instruments'}>
    {analysis && <fieldset className={styles.analysisRunner} disabled={!ready || capturing || spiceRunning}>
      <NativeAnalysisControls key={spiceRunRequest} api={nativeApi} settings={{ ...analysisSettings, duration: Number(duration), samples: Number(samples) }} onChange={changeAnalysis} onApplySource={applySource} section="analysis"/>
      <div className={styles.analysisAction}><button type="button" className={styles.capture} disabled={!ready || capturing || spiceRunning} onClick={runAnalysis}><Play size={14}/>{spiceRunning ? 'Running analysis…' : analysisAction}</button><span>{analysisSettings.type === 'ac-sweep' ? 'Magnitude and phase versus frequency appear below.' : analysisSettings.type === 'dc-sweep' ? 'Output versus swept source appears below.' : analysisSettings.type === 'operating-point' ? 'Node voltages and source currents appear below.' : 'Simulate the current circuit using the selected SPICE models.'}</span></div>
    </fieldset>}
    <details className={styles.timeCaptureControls} open={analysisSettings.type === 'transient' || timeControlsOpen} onToggle={event => setTimeControlsOpen(event.currentTarget.open)}>
    <summary hidden={analysisSettings.type === 'transient'}>Time capture · Oscilloscope, FFT &amp; logic</summary>
    <div className={styles.recordControls}>
      <label>Duration (s)<input aria-label="Capture duration in seconds" disabled={live || capturing || spiceRunning} type="number" min="0.000000001" max="10" step="any" value={duration} onChange={event => setDuration(event.target.value)}/></label>
      <label>Samples / probe<select aria-label="Capture target samples" disabled={live || capturing || spiceRunning} value={samples} onChange={event => setSamples(event.target.value)}>{[...new Set([...ACQUISITION_SAMPLE_OPTIONS, Number(samples)])].sort((a,b)=>a-b).map(count=><option key={count} value={count}>{count.toLocaleString('en-US')}</option>)}</select></label>
      <button type="button" disabled={!ready || live || capturing || spiceRunning || Number(duration) + (analysisSettings.settleDuration ?? 0) >= 10 || (resultSource==='spice' && (!spiceLinked || displayedPayload?.analysis !== 'transient'))} title={resultSource==='spice' && !spiceLinked ? 'Edit the duration in your separate solver source to extend that run.' : 'Acquire twice the duration with the same engine'} onClick={() => recordWithSettings({duration: Math.min(10-(analysisSettings.settleDuration??0),Number(duration)*2),samples:Math.min(131072,Number(samples)*2)})}>2× longer</button>
      <small>{resultSource==='spice' && !spiceLinked ? 'Separate deck: edit its run duration and sample interval in Advanced solver source.' : `${probes.filter(probe=>probe.enabled).length} enabled probes · ${formatEngineering(Number(duration),'s')} record · all instruments share the same samples.`}</small>
    </div>
    <div className={styles.captureBar}>
      <button type="button" className={styles.liveButton} aria-pressed={live} disabled={!ready || capturing || spiceRunning || !probes.some((probe) => probe.enabled)} onClick={() => { if (live) stopLive(); else startLive(); }}>{live ? 'Freeze measurements' : 'Start live measurements'}</button>
      {live && <output className={styles.liveStatus} aria-label="Live acquisition status">Live · {liveDepth.toLocaleString()} samples</output>}
      <button className={styles.capture} type="button" disabled={!ready || capturing || spiceRunning || live || !probes.some((probe) => probe.enabled)} onClick={() => void capture()}><Waves size={17}/>{capturing ? 'Capturing… ' + captureProgress + '%' : 'Capture all probes'}</button>
      {capturing && <button type="button" onClick={() => cancelCaptureRef.current?.()}>Cancel</button>}
      <details className={styles.acquisitionOptions}><summary>Acquisition options</summary><div>
        <label>Start<select aria-label="Capture start" disabled={capturing || live} value={captureOrigin} onChange={event => setCaptureOrigin(event.target.value as typeof captureOrigin)}><option value="restart">Time zero</option><option value="continue">Current state</option></select></label>
        <label>Live mode<select aria-label="Live acquisition mode" disabled={capturing || live} value={liveMode} onChange={event => setLiveMode(event.target.value as typeof liveMode)}><option value="record">One record</option><option value="continuous">Continuous</option></select></label>
        <label>Settle before capture (s)<input aria-label="Capture settling time in seconds" type="number" min="0" max="10" step="any" disabled={capturing || live || spiceRunning} value={analysisSettings.settleDuration ?? 0} onChange={event => changeAnalysis({ ...settingsRef.current, settleDuration: Number(event.target.value) })}/></label>
        <small>Settling advances the real solver before a finite capture. Live measurements retain their full history.</small>
      </div></details>
    </div>
    </details>
    <div ref={instrumentRef} className={styles.instruments}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {spicePayload && <div className={styles.sourceSwitch}><button type="button" aria-pressed={resultSource === 'circuit'} onClick={() => setResultSource('circuit')}>Circuit probes</button><button type="button" aria-pressed={resultSource === 'spice'} onClick={() => setResultSource('spice')}>SPICE response</button></div>}
      {displayedPayload && <div className={styles.resultHeading} role="status"><h2>{resultName(displayedPayload)}</h2><span>{displayedPayload.engine === 'circuitjs1' ? 'Circuit probes' : 'SPICE'} · {displayedPayload.x.length ? `${displayedPayload.x.length.toLocaleString()} points` : `${displayedPayload.operatingPoint.length} readings`}</span>{displayedPayload.analysis === 'transient' && analysisSettings.type !== 'transient' && <small>This is a time capture. Choose “{analysisAction}” above for the selected analysis.</small>}</div>}
      {displayedPayload && displayedPayload.warnings.map((warning) => <p className={styles.note} key={warning}>{warning}</p>)}
      {displayedPayload ? <ScopeResult payload={displayedPayload} preferredInstrument={preferredInstrument === 'dc' ? 'dc' : 'scope'} recordDuration={Number(duration)+(analysisSettings.settleDuration??0)} onMaximizedChange={setInstrumentMaximized} view={instrumentView} onViewChange={setInstrumentView} fftLength={fftLength} onFftLengthChange={setFftLength} selectedTraceId={selectedTraceId} onSelectTrace={selectTrace} onRequestCapture={resultSource==='spice' && !spiceLinked ? undefined : requestFftCapture}/> : <div className={styles.empty}><Waves size={30}/><strong>{spiceRunning ? 'Simulating the current circuit…' : resultSource === 'spice' ? analysisAction : 'Watch your circuit respond'}</strong><p>{resultSource === 'spice' ? analysisSettings.type === 'ac-sweep' ? 'Run the AC sweep above. Bode magnitude and phase will appear here.' : analysisSettings.type === 'dc-sweep' ? 'Run the DC sweep above. The source-to-output transfer curve will appear here.' : 'Run the selected analysis above to display its results here.' : 'Set Duration and Samples / probe above, then capture all enabled probes together. Scope, FFT and logic use that same measured record.'}</p></div>}</div>
    {analysis && <div ref={analysisRef} className={styles.analysisPane}>
      <SimulationConsole {...analysis} prepareCircuit={prepareCircuit} prepareGrading={analysis.judge ? prepareGrading : undefined} onResult={acceptSpiceResult} onRunningChange={setSpiceRunning} onError={setError} runRequest={spiceRunRequest} runRequestSource="schematic" hideWaveforms compact getCurrentInvalidationKey={currentInvalidationKey} invalidationKey={JSON.stringify([nativeApi?.getCircuitRevision?.() ?? circuitVersion, analysisSettings, duration, samples])}
        settingsSlot={<NativeAnalysisControls api={nativeApi} settings={{ ...analysisSettings, duration: Number(duration), samples: Number(samples) }} onChange={setAnalysisSettings} onApplySource={applySource} section="sources"/>}/>
      {modelNotes.map(note => <p className={styles.note} key={note}>{note}</p>)}
    </div>}
    {designChecks?.length ? <DesignCheckPanel checks={designChecks} result={spicePayload}/> : null}
    <details ref={probeDetailsRef} className={styles.probeDetails}><summary>Probes &amp; capture settings <span>{probes.length} channels · {Number(samples).toLocaleString('en-US')} samples</span></summary>
    <div className={styles.probeScroll} style={{ height: probeHeight }}>
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
        <button type="button" aria-label={`Select probe ${index + 1} ${probe.name}`} aria-pressed={selectedProbeId === probe.id} style={{ color: probe.color }} onClick={() => selectProbe(probe.id)}>{index + 1}</button>
        <details className={styles.probeColor}><summary aria-label={`Probe ${index + 1} color`} style={{ color: probe.color }}>●</summary><InlineColorPicker label={`Probe ${index + 1} color`} value={probe.color} onChange={color => updateProbes(probes.map(entry => entry.id === probe.id ? { ...entry, color } : entry))}/></details>
        <input aria-label={`Probe ${index + 1} name`} value={probe.name} maxLength={80} onChange={(event) => updateProbes(probes.map((entry) => entry.id === probe.id ? { ...entry, name: event.target.value } : entry))}/>
        <output>{Number.isFinite(values[probe.id]) ? values[probe.id].toPrecision(4) : '—'} {probe.kind === 'current' ? 'A' : 'V'}</output>
        <button type="button" aria-label={`Remove ${probe.name}`} disabled={capturing} onClick={() => updateProbes(probes.filter((entry) => entry.id !== probe.id))}><Trash2 size={14}/></button>
      </div>)}</div>
    </div>
    </div>
    <WorkspaceDivider label="Resize probe settings" orientation="horizontal" value={probeHeight} minimum={120} maximum={600} defaultValue={210} step={20} onChange={value => { setProbeHeight(value); persistLayout({ probeHeight: value }); }} onActive={active => { setResizing(active); if (!active) persistLayout(); }} className={styles.horizontalDivider}/>
    </details>
    <p className={styles.status} role="status">{status}</p>
    </div>
    </div>
  </section>;
}
