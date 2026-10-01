import { circuitDocumentSchema, compileCircuitDocument, type CircuitComponent, type CircuitDocument, type ConnectionPoint } from './circuit-document';
import type { CircuitJsApi, CircuitJsElement } from './circuitjs';
import { gradingBlueprint } from './grading-blueprints';

/** Narrow interoperability with the registered fixed-topology graders. CircuitJS owns the graph. */
export function circuitJsGradingDocument(api: CircuitJsApi, slug: string): CircuitDocument {
  const blueprint = gradingBlueprint(slug);
  if (!blueprint) throw new Error('This challenge does not have a fixed-topology grader.');
  if (api.getStopMessage()) throw new Error(`Fix the native circuit before preparing grading: ${api.getStopMessage()}`);
  const elements = api.getElements();
  const components: CircuitComponent[] = [];
  const nodePins = new Map<number, ConnectionPoint[]>();
  const counts: Record<string, number> = {};
  const labels: Array<{ element: CircuitJsElement; name: string }> = [];
  function bind(element: CircuitJsElement, id: string, pinIds: string[]) {
    if (element.getPostCount() !== pinIds.length) throw new Error('A component has an unsupported terminal configuration.');
    pinIds.forEach((pinId, index) => {
      const node = element.getNodeId(index);
      if (node < 0) throw new Error('Wait for CircuitJS to finish analyzing the circuit.');
      const pins = nodePins.get(node) ?? [];
      pins.push({ type: 'pin', componentId: id, pinId }); nodePins.set(node, pins);
    });
  }
  for (const element of elements) {
    const type = element.getType();
    if (['WireElm', 'RoutedWireElm', 'OutputElm', 'ProbeElm', 'TextElm', 'TestPointElm'].includes(type)) continue;
    if (type === 'LabeledNodeElm') { labels.push({ element, name: element.getLabelName() }); continue; }
    // These numeric attributes are emitted by upstream dumpXml, rather than UI-rounded display text.
    const attributes = new Map([...element.exportElement().matchAll(/\s([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    const number = (key: string, fallback?: number) => { const raw = attributes.get(key); const value = raw === undefined ? fallback : Number(raw); if (value === undefined || !Number.isFinite(value)) throw new Error(`Invalid ${type} value in the native circuit.`); return value; };
    const count = (counts[type] = (counts[type] ?? 0) + 1);
    const id = `native-${components.length + 1}`;
    const base = { id, position: { x: element.getPostX(0), y: element.getPostY(0) }, rotation: 0 as const };
    if (type === 'GroundElm') {
      components.push({ ...base, reference: `GND${count}`, kind: 'ground', parameters: {} }); bind(element, id, ['gnd']);
    } else if (type === 'ResistorElm') {
      const reference = blueprint === 'inverting-gain-stage' ? (count === 1 ? 'RIN' : count === 2 ? 'RF' : `R${count}`) : `R${count}`;
      components.push({ ...base, reference, kind: 'resistor', parameters: { resistanceOhm: number('r') } }); bind(element, id, ['a', 'b']);
    } else if (type === 'CapacitorElm') {
      if (blueprint !== 'rc-cutoff-1khz') throw new Error('This grader does not accept capacitors.');
      if (number('sr', 0) !== 0) throw new Error('The RC grader requires an ideal capacitor without series resistance.');
      components.push({ ...base, reference: `C${count}`, kind: 'capacitor', parameters: { capacitanceF: number('c'), initialVoltageV: number('iv', 0) } }); bind(element, id, ['a', 'b']);
    } else if (['VoltageElm', 'DCVoltageElm', 'ACVoltageElm'].includes(type)) {
      const waveform = number('wf'), amplitude = number('maxv'), bias = number('bias', 0);
      if (number('ir', 0) !== 0 || number('phaseShift', 0) !== 0) throw new Error('Use the ideal source without internal resistance or phase shift for grading.');
      if (blueprint === 'rc-cutoff-1khz' && (waveform !== 1 || bias !== 0)) throw new Error('The RC grader requires a sine source with zero offset; its amplitude becomes the AC test magnitude.');
      if (blueprint !== 'rc-cutoff-1khz' && waveform !== 0) throw new Error('This grader requires the original DC voltage source.');
      components.push({ ...base, reference: `V${count}`, kind: 'voltage-source', parameters: blueprint === 'rc-cutoff-1khz' ? { dcV: 0, ac: { magnitude: amplitude, phaseDeg: 0 } } : { dcV: amplitude + bias } });
      // CircuitJS voltage-source post 0 is negative and post 1 is positive.
      bind(element, id, ['negative', 'positive']);
    } else if (type === 'OpAmpElm') {
      if (blueprint !== 'inverting-gain-stage' || number('ma') !== 15 || number('mi') !== -15) throw new Error('Use the challenge’s original ideal op-amp model and output rails for grading.');
      components.push({ ...base, reference: `U${count}`, kind: 'op-amp-ideal', parameters: { openLoopGain: number('ga') } });
      // Swapping display orientation never changes CircuitJS's electrical post order.
      bind(element, id, ['inverting', 'nonInverting', 'output']);
    } else throw new Error(`${type.replace(/Elm$/, '')} is available for simulation but unsupported by this fixed-topology grader.`);
  }
  const wires: CircuitDocument['wires'] = [];
  for (const pins of nodePins.values()) for (let index = 1; index < pins.length; index++) wires.push({ id: `native-wire-${wires.length + 1}`, from: pins[0], to: pins[index], waypoints: [] });
  const netLabels: CircuitDocument['netLabels'] = [];
  const names = new Set<string>();
  for (const { element, name } of labels) {
    const target = nodePins.get(element.getNodeId(0))?.[0];
    if (!target || names.has(name)) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) throw new Error('Use simple alphanumeric node labels before preparing grading.');
    names.add(name); netLabels.push({ id: `native-label-${netLabels.length + 1}`, name, target, position: { x: element.getPostX(0), y: element.getPostY(0) } });
  }
  // Infer the measurement point from the native graph, never drawing order or
  // a reference deck. A misplaced explicit label is rejected by the server.
  const voltage = elements.find((element) => ['VoltageElm', 'DCVoltageElm', 'ACVoltageElm'].includes(element.getType()));
  const resistors = elements.filter((element) => element.getType() === 'ResistorElm');
  const signalNodes = (element: CircuitJsElement) => Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)).filter((node) => node > 0 && node !== voltage?.getNodeId(1));
  const amplifier = elements.find((element) => element.getType() === 'OpAmpElm');
  const capacitor = elements.find((element) => element.getType() === 'CapacitorElm');
  const inferredNode = blueprint === 'inverting-gain-stage' ? amplifier?.getNodeId(2)
    : blueprint === 'rc-cutoff-1khz' ? capacitor && signalNodes(capacitor).find((node) => resistors.some((resistor) => signalNodes(resistor).includes(node)))
    : resistors.length === 2 ? signalNodes(resistors[0]).find((node) => signalNodes(resistors[1]).includes(node)) : undefined;
  const inferredOutput = inferredNode === undefined ? undefined : nodePins.get(inferredNode)?.[0];
  const output = inferredOutput ?? netLabels.find((label) => label.name.toLowerCase() === 'vout')?.target;
  if (!output) throw new Error('Wire the supplied parts first, then select the output junction or attach the vout label before checking.');
  if (!netLabels.some((label) => label.name.toLowerCase() === 'vout')) netLabels.push({ id: 'native-auto-vout', name: 'vout', target: output, position: { x: 0, y: 0 } });
  const document = circuitDocumentSchema.parse({ version: 1, id: 'circuitjs-grading', title: 'CircuitJS challenge snapshot', revision: 0, components, junctions: [], wires, netLabels,
    probes: [{ id: 'native-output', label: 'V(vout)', quantity: 'voltage', target: output }],
    analyses: blueprint === 'rc-cutoff-1khz' ? [{ id: 'native-ac', name: 'Frequency response', type: 'ac-sweep', scale: 'decade', points: 30, startHz: 10, stopHz: 100000 }] : [{ id: 'native-op', name: 'Operating point', type: 'operating-point' }], settings: { gridSize: 16, snapToGrid: true } });
  compileCircuitDocument(document, 'simulation');
  return document;
}
