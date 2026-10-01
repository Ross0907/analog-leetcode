import { circuitDocumentSchema, type CircuitAnalysis, type CircuitComponent, type CircuitDocument, type ConnectionPoint } from './circuit-document';
import { generateSpiceDeckFromCircuitDocument } from './circuit-spice';
import type { CircuitJsApi, CircuitJsElement } from './circuitjs';

export type NativeAnalysisSettings = {
  type: 'transient' | 'operating-point' | 'ac-sweep' | 'dc-sweep';
  duration: number;
  samples: number;
  startHz: number;
  stopHz: number;
  dcStart: number;
  dcStop: number;
  dcStep: number;
};

/** Interoperability only: read CircuitJS's solved node IDs and exact exported values.
 * Unsupported models fail explicitly instead of substituting a different device model.
 * Editing, wiring, hit testing and native simulation remain owned by CircuitJS.
 */
export function circuitJsAnalysis(api: CircuitJsApi, settings: NativeAnalysisSettings) {
  if (api.getStopMessage()) throw new Error('Fix the schematic before analysis: ' + api.getStopMessage());
  const components: CircuitComponent[] = [];
  const nodePins = new Map<number, ConnectionPoint[]>();
  const labels = new Map<number, string>();
  const references: Record<string, number> = {};
  const reference = (prefix: string) => prefix + (references[prefix] = (references[prefix] ?? 0) + 1);
  function bind(node: number, componentId: string, pinId: string) {
    if (!Number.isInteger(node) || node < 0) throw new Error('Wait for the schematic to finish connecting its nodes.');
    const pins = nodePins.get(node) ?? [];
    pins.push({ type: 'pin', componentId, pinId }); nodePins.set(node, pins);
  }
  function terminal(element: CircuitJsElement, id: string, pinIds: string[]) {
    if (element.getPostCount() !== pinIds.length) throw new Error('Unsupported terminal count in ' + element.getType());
    pinIds.forEach((pin, post) => bind(element.getNodeId(post), id, pin));
  }
  for (const element of api.getElements()) {
    const type = element.getType();
    if (['WireElm', 'RoutedWireElm', 'OutputElm', 'ProbeElm', 'TextElm', 'TestPointElm', 'BoxElm'].includes(type)) continue;
    if (type === 'LabeledNodeElm') {
      const name = element.getLabelName();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) throw new Error('SPICE node labels must use letters, numbers and underscores, beginning with a letter.');
      const previous = labels.get(element.getNodeId(0));
      if (previous && previous.toLowerCase() !== name.toLowerCase()) throw new Error('Use one name for each electrical node before SPICE analysis.');
      labels.set(element.getNodeId(0), name); continue;
    }
    const attributes = new Map([...element.exportElement().matchAll(/\s([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    const value = (key: string, fallback?: number) => {
      const raw = attributes.get(key), result = raw === undefined ? fallback : Number(raw);
      if (result === undefined || !Number.isFinite(result)) throw new Error('Invalid ' + type + ' parameter: ' + key);
      return result;
    };
    const id = 'native-' + (components.length + 1);
    const base = { id, position: { x: element.getPostX(0), y: element.getPostY(0) }, rotation: 0 as const };
    if (type === 'GroundElm') {
      components.push({ ...base, reference: reference('GND'), kind: 'ground', parameters: {} }); terminal(element, id, ['gnd']);
    } else if (type === 'ResistorElm') {
      components.push({ ...base, reference: reference('R'), kind: 'resistor', parameters: { resistanceOhm: value('r') } }); terminal(element, id, ['a', 'b']);
    } else if (type === 'CapacitorElm' || type === 'PolarCapacitorElm') {
      if (value('sr', 0) !== 0) throw new Error('SPICE conversion currently supports capacitors without series resistance. Use live measurements for this model.');
      components.push({ ...base, reference: reference('C'), kind: 'capacitor', parameters: { capacitanceF: value('c'), initialVoltageV: value('iv', 0) } }); terminal(element, id, ['a', 'b']);
    } else if (type === 'InductorElm') {
      if (value('isat', 0) !== 0) throw new Error('SPICE conversion currently supports unsaturated inductors. Use live measurements for this model.');
      components.push({ ...base, reference: reference('L'), kind: 'inductor', parameters: { inductanceH: value('l'), initialCurrentA: value('ic', 0) } }); terminal(element, id, ['a', 'b']);
    } else if (['VoltageElm', 'DCVoltageElm', 'ACVoltageElm', 'RailElm', 'ACRailElm'].includes(type)) {
      const waveform = value('wf'), amplitude = value('maxv'), bias = value('bias', 0), phaseDeg = value('phaseShift', 0) * 180 / Math.PI;
      if (![0, 1].includes(waveform) || value('ir', 0) !== 0) throw new Error('SPICE conversion supports ideal DC and sine sources. Use live measurements for other source waveforms or internal resistance.');
      const parameters: Extract<CircuitComponent, { kind: 'voltage-source' }>['parameters'] = waveform === 0
        ? { dcV: amplitude + bias }
        : { dcV: bias, ac: { magnitude: Math.abs(amplitude), phaseDeg: phaseDeg + (amplitude < 0 ? 180 : 0) }, transient: { type: 'sine', offset: bias, amplitude, frequencyHz: value('fr'), delayS: 0, dampingPerS: 0, phaseDeg } };
      components.push({ ...base, reference: reference('V'), kind: 'voltage-source', parameters });
      if (type === 'RailElm' || type === 'ACRailElm') { terminal(element, id, ['positive']); bind(0, id, 'negative'); }
      else terminal(element, id, ['negative', 'positive']);
    } else if (type === 'CurrentElm') {
      if (value('mv', 0) !== 0) throw new Error('SPICE conversion supports ideal current sources without a compliance limit. Use live measurements for this source.');
      components.push({ ...base, reference: reference('I'), kind: 'current-source', parameters: { dcA: value('cu') } }); terminal(element, id, ['positive', 'negative']);
    } else throw new Error(type.replace(/Elm$/, '') + ' has no equivalent SPICE model in this workspace yet. Use live circuit measurements, or explicitly select the separate reference deck.');
  }
  // Ground is CircuitJS's actual node 0, including the implicit return of a rail.
  if (nodePins.has(0) && !components.some((component) => component.kind === 'ground')) {
    components.push({ id: 'native-ground', reference: reference('GND'), kind: 'ground', position: { x: 0, y: 0 }, rotation: 0, parameters: {} });
    bind(0, 'native-ground', 'gnd');
  }
  const wires: CircuitDocument['wires'] = [];
  const netLabels: CircuitDocument['netLabels'] = [];
  const probes: CircuitDocument['probes'] = [];
  const usedNames = new Set<string>();
  for (const [node, pins] of nodePins) {
    for (let index = 1; index < pins.length; index++) wires.push({ id: 'native-wire-' + wires.length, from: pins[0], to: pins[index], waypoints: [] });
    if (node === 0) continue;
    const name = labels.get(node) ?? 'node' + node;
    if (usedNames.has(name.toLowerCase())) throw new Error('Two different nodes resolve to the same SPICE name. Rename one of the labels before analysis.');
    usedNames.add(name.toLowerCase());
    netLabels.push({ id: 'native-label-' + node, name, target: pins[0], position: { x: 0, y: 0 } });
    if (probes.length < 32) probes.push({ id: 'native-probe-' + node, label: 'V(' + name + ')', quantity: 'voltage', target: pins[0] });
  }
  if (nodePins.size > 33) throw new Error('SPICE analysis supports up to 32 signal nodes in this workspace. Reduce the circuit or use live probes.');
  const source = components.find((component) => component.kind === 'voltage-source' || component.kind === 'current-source');
  let analysis: CircuitAnalysis;
  const common = { id: 'native-analysis', name: 'Current schematic' };
  switch (settings.type) {
    case 'operating-point': analysis = { ...common, type: 'operating-point' }; break;
    case 'ac-sweep':
      if (!components.some((component) => component.kind === 'voltage-source' && component.parameters.ac?.magnitude)) throw new Error('Add a sine voltage source for AC analysis; its amplitude is the AC test magnitude.');
      analysis = { ...common, type: 'ac-sweep', scale: 'decade', points: 60, startHz: settings.startHz, stopHz: settings.stopHz }; break;
    case 'dc-sweep':
      if (!source) throw new Error('Add a voltage or current source to sweep.');
      analysis = { ...common, type: 'dc-sweep', sourceComponentId: source.id, start: settings.dcStart, stop: settings.dcStop, step: settings.dcStep }; break;
    default: analysis = { ...common, type: 'transient', stepS: settings.duration / Math.min(settings.samples, 131072), stopS: settings.duration, startS: 0 };
  }
  const document = circuitDocumentSchema.parse({ version: 1, id: 'native-analysis', title: 'Current CircuitJS schematic', revision: 0, components, junctions: [], wires, netLabels, probes, analyses: [analysis], settings: { gridSize: 16, snapToGrid: true } });
  const generated = generateSpiceDeckFromCircuitDocument(document);
  return { document, deck: generated.deck, probes: Object.values(generated.probeExpressions) };
}
