import type { SimulationPayload } from './simulator-contract';

/** Public upstream JS API, plus the small native measurement extensions in patch-circuitjs-api.mjs. */
export interface CircuitJsElement {
  getType(): string;
  getInfo(): string[];
  getVoltage(post: number): number;
  getVoltageDiff(): number;
  getCurrent(): number;
  getPostCount(): number;
  getLabelName(): string;
  getPostX(post: number): number;
  getPostY(post: number): number;
  getNodeId(post: number): number;
  exportElement(): string;
}

export interface CircuitJsApi {
  addElement(nativeType: string): void;
  getElements(): CircuitJsElement[];
  getHoveredElement(): CircuitJsElement | null;
  getTime(): number;
  getTimeStep(): number;
  getMaxTimeStep(): number;
  setMaxTimeStep(value: number): void;
  getNodeVoltage(label: string): number;
  getStopMessage(): string | null;
  setSimRunning(running: boolean): void;
  isRunning(): boolean;
  exportCircuit(): string;
  importCircuit(text: string, subcircuitsOnly: boolean): void;
  screenX(x: number): number;
  screenY(y: number): number;
  /** Positive zooms in; negative zooms out through the upstream zoom command. */
  zoomCircuit(direction: number): void;
  onanalyze?: (api: CircuitJsApi) => void;
  onupdate?: (api: CircuitJsApi) => void;
  ontimestep?: (api: CircuitJsApi) => void;
}

export type CircuitJsProbe = {
  id: string;
  name: string;
  kind: 'voltage' | 'current';
  element: CircuitJsElement;
  post: number;
  color: string;
  enabled: boolean;
};

export const CIRCUITJS_PROBE_COLORS = ['#fbbf24', '#38bdf8', '#c084fc', '#34d399', '#fb7185', '#fb923c', '#a3e635', '#e879f9'];
export const MAX_CIRCUITJS_PROBES = 32;
export const MAX_CIRCUITJS_FILE_BYTES = 2_000_000;

export function circuitJsElementName(element: CircuitJsElement, index: number) {
  if (element.getType() === 'LabeledNodeElm') return element.getLabelName();
  return `${element.getType().replace(/Elm$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')} ${index + 1}`;
}

export function supportsCircuitJsCurrent(element: CircuitJsElement) {
  return element.getPostCount() === 2 && !['WireElm', 'RoutedWireElm', 'GraphicElm', 'ProbeElm'].includes(element.getType());
}

/** The native solver's node IDs, never geometric line crossings, define probe association. */
export function circuitJsNodeOptions(elements: CircuitJsElement[]) {
  const nodes = new Map<number, { id: number; name: string; element: CircuitJsElement; post: number }>();
  elements.forEach((element, index) => {
    for (let post = 0; post < element.getPostCount(); post++) {
      const id = element.getNodeId(post);
      if (id < 0) continue;
      const label = element.getType() === 'LabeledNodeElm' ? element.getLabelName() : null;
      if (!nodes.has(id) || label) nodes.set(id, { id, name: id === 0 ? 'Ground (0 V)' : label ?? `Node ${id} · ${circuitJsElementName(element, index)}, terminal ${post + 1}`, element, post });
    }
  });
  return [...nodes.values()].sort((a, b) => a.id - b.id);
}

export function validateCircuitJsText(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_CIRCUITJS_FILE_BYTES) throw new Error('Circuit file exceeds the 2 MB limit.');
  if (!text.trimStart().startsWith('$ ') && !/^<cir(?:\s|>)/.test(text.trimStart())) throw new Error('Choose a CircuitJS circuit text or XML file exported through File → Export As Text. SPICE decks belong in SPICE analysis.');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Circuit files must not contain document types or external entities.');
  if (text.split(/\r?\n/).length > 5_000 || text.includes('\0')) throw new Error('The circuit file is too large or contains invalid text.');
  if (text.trimStart().startsWith('<')) {
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (document.getElementsByTagName('parsererror').length || document.documentElement.tagName !== 'cir') {
      throw new Error('The XML file is incomplete or malformed. Choose a well-formed CircuitJS XML file.');
    }
  }
  return text;
}

export function readCircuitJsProbe(probe: CircuitJsProbe) {
  return probe.kind === 'current' ? probe.element.getCurrent() : probe.element.getVoltage(probe.post);
}

/** CircuitJS's own display flags: hide voltage/power coloring and current dots. */
export function neutralCircuitJsPresentation(text: string) {
  const displayFlags = (flags: number) => (flags | 4) & ~1 & ~8;
  if (text.trimStart().startsWith('$ ')) {
    return text.replace(/^(\s*\$\s+)(\d+)/, (_match, prefix: string, flags: string) => `${prefix}${displayFlags(Number(flags))}`);
  }
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement.tagName !== 'cir') throw new Error('Choose a valid CircuitJS circuit.');
  const flags = Number(document.documentElement.getAttribute('f') ?? 0);
  if (!Number.isSafeInteger(flags) || flags < 0) throw new Error('The circuit has invalid display options.');
  document.documentElement.setAttribute('f', String(displayFlags(flags)));
  return new XMLSerializer().serializeToString(document);
}

/** Captures actual accepted solver timesteps through CircuitJS's documented timestep callback. */
export function captureCircuitJs(api: CircuitJsApi, probes: CircuitJsProbe[], duration: number, requestedSamples: number) {
  if (!(duration >= 1e-9 && duration <= 10) || !Number.isFinite(duration)) throw new Error('Capture duration must be between 1 ns and 10 seconds.');
  if (!Number.isInteger(requestedSamples) || requestedSamples < 128 || requestedSamples > 16384) throw new Error('Choose between 128 and 16,384 samples.');
  const active = probes.filter((probe) => probe.enabled);
  if (!active.length || active.length > MAX_CIRCUITJS_PROBES) throw new Error('Enable between 1 and 32 probes before capturing.');
  const elements = api.getElements();
  if (active.some((probe) => !elements.includes(probe.element) || probe.post >= probe.element.getPostCount())) throw new Error('A probed component was removed. Refresh the probe selection.');
  const started = performance.now();
  const initialTime = api.getTime();
  const x: number[] = [];
  const values = active.map(() => [] as number[]);
  const maxPoints = Math.min(32768, requestedSamples * 4);
  let finished = false;
  let resolve!: (payload: SimulationPayload) => void;
  let reject!: (error: Error) => void;
  const previousHook = api.ontimestep;
  const result = new Promise<SimulationPayload>((yes, no) => { resolve = yes; reject = no; });
  const timeout = setTimeout(() => fail('Capture timed out. Reduce the duration or simplify the circuit.'), 20_000);
  function cleanup() {
    finished = true;
    clearTimeout(timeout);
    api.ontimestep = previousHook;
    api.setSimRunning(false);
  }
  function fail(message: string) {
    if (finished) return;
    cleanup();
    reject(new Error(message));
  }
  function complete(capped = false) {
    if (finished) return;
    cleanup();
    resolve({ engine: 'circuitjs1', analysis: 'transient', xLabel: 'Time', xUnit: 's', yLabel: 'Probe readings', yUnit: 'V', x,
      traces: active.map((probe, index) => ({ id: probe.id, name: probe.name, values: values[index], unit: probe.kind === 'current' ? 'A' : 'V', quantity: probe.kind, color: probe.color, node: `CircuitJS node ${probe.element.getNodeId(probe.post)}` })),
      operatingPoint: active.map((probe, index) => ({ name: probe.name, value: values[index].at(-1) ?? 0, unit: probe.kind === 'current' ? 'A' : 'V' })),
      warnings: capped ? ['Capture reached its adaptive-sample limit before the requested duration. Increase the sample interval.'] : [], runtimeMs: performance.now() - started });
  }
  api.setSimRunning(false);
  api.setMaxTimeStep(duration / (requestedSamples - 1));
  api.ontimestep = (current) => {
    previousHook?.(current);
    if (finished) return;
    const time = current.getTime() - initialTime;
    if (time < 0) return fail('Circuit was reset during capture. Start a new capture.');
    if (x.length && time <= x[x.length - 1]) return;
    const sample = active.map(readCircuitJsProbe);
    if (sample.some((value) => !Number.isFinite(value))) return fail('The solver returned a non-finite voltage or current. Check the circuit.');
    x.push(time);
    sample.forEach((value, index) => values[index].push(value));
    if (time >= duration) complete();
    else if (x.length >= maxPoints) complete(true);
  };
  api.setSimRunning(true);
  return { result, cancel: (message = 'Capture cancelled.') => fail(message) };
}
