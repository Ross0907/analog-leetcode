import { CircuitDocumentError, circuitDocumentSchema, type CircuitAnalysis, type CircuitComponent, type CircuitDocument, type ConnectionPoint } from './circuit-document';
import { generateSpiceDeckFromCircuitDocument } from './circuit-spice';
import type { CircuitJsApi, CircuitJsElement } from './circuitjs';
import { circuitJsElementName } from './circuitjs';
import { repeatPwlPoints, stimulusPoints } from './native-stimulus';
import type { AdvancedCircuitJsApi } from './circuitjs-advanced';
import { SIMULATOR_NETLIST_LIMITS } from './simulator-netlist-policy';

export type NativeSourceOverride =
  | { type: 'dc'; value: number }
  | { type: 'sine'; offset: number; amplitude: number; frequencyHz: number; phaseDeg?: number }
  | { type: 'pwl'; points: { timeS: number; value: number }[]; repeatPeriodS?: number }
  | { type: 'bitstream'; bits: string; bitPeriodS: number; low: number; high: number; riseS: number; delayS?: number; repeat?: boolean };

export type NativeAnalysisOption = { index: number; label: string; nativeType: string };
export type NativeModelOption = NativeAnalysisOption & {
  defaultModel: string;
  choices: { id: string; label: string; description: string }[];
};

export type NativeAnalysisSettings = {
  type: 'transient' | 'operating-point' | 'ac-sweep' | 'dc-sweep';
  duration: number;
  samples: number;
  /** Real solver warm-up, excluded from the returned transient record. */
  settleDuration?: number;
  startHz: number;
  stopHz: number;
  dcStart: number;
  dcStop: number;
  dcStep: number;
  acScale?: 'decade' | 'octave' | 'linear';
  acPoints?: number;
  /** Index in api.getElements(), not the source ordinal. */
  acSource?: number;
  acMagnitude?: number;
  acPhaseDeg?: number;
  dcSource?: number;
  /** Explicit SPICE model choices; the native live solver retains its own model. */
  models?: Record<number, string>;
  sourceOverrides?: Record<number, NativeSourceOverride>;
};

const modelChoice = (id: string, label: string, description: string) => ({ id, label, description });
const opampChoices = [modelChoice('native-ideal', 'Ideal op-amp · native limits', 'The schematic gain and output limits; no bandwidth, offset, slew rate, or output current limit.'), modelChoice('lm741', 'LM741 · Texas Instruments', 'National Semiconductor macro-model, distributed by TI. Uses the schematic supply rails; nominal bipolar IC behavior.')];
const sourceTypes = ['VoltageElm', 'DCVoltageElm', 'ACVoltageElm', 'RailElm', 'ACRailElm', 'SquareRailElm', 'ClockElm', 'CurrentElm', 'DataInputElm'];
function attributesOf(element: CircuitJsElement) { return new Map([...element.exportElement().matchAll(/\s([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g)].map(match => [match[1], match[2]])); }
/** Shared stable ordering for conversion and host model-setting identity tracking. */
export function circuitJsAnalysisElements(api: CircuitJsApi): CircuitJsElement[] {
  const elements = [...api.getElements()];
  if (elements.some(element => element.getType() === 'CustomCompositeElm')) {
    const advanced = api as Partial<AdvancedCircuitJsApi>;
    if (!advanced.getAnalysisElements) throw new Error('Reload the editor to analyze native subcircuits.');
    const known = new Set(elements);
    for (const element of advanced.getAnalysisElements()) if (!known.has(element)) { elements.push(element); known.add(element); }
  }
  return elements;
}
export function circuitJsAnalysisOptions(api: CircuitJsApi): { sources: NativeAnalysisOption[]; models: NativeModelOption[] } {
  const sources: NativeAnalysisOption[] = [], models: NativeModelOption[] = [];
  const topLevelCount = api.getElements().length;
  circuitJsAnalysisElements(api).forEach((element, index) => {
    const nativeType = element.getType(), label = circuitJsElementName(element, index) + (index >= topLevelCount ? ' · inside block' : ''), attrs = attributesOf(element);
    const base = { index, label, nativeType };
    if (index < topLevelCount && sourceTypes.includes(nativeType)) sources.push(base);
    let choices: NativeModelOption['choices'] | undefined;
    if (nativeType === 'OpAmpElm') choices = opampChoices;
    if (nativeType === 'OpAmpRealElm') {
      const nativeModel = Number(attrs.get('mt') ?? 0);
      choices = nativeModel === 0 ? opampChoices.slice(1) : [
        modelChoice('native-unmapped', nativeModel === 1 || nativeModel === 2 ? 'LM324 · choose a SPICE replacement' : 'Native IC · choose a SPICE replacement', 'This native IC has no matching bundled SPICE model. Use live measurements, or explicitly choose a different IC for SPICE analysis.'),
        modelChoice('lm741', 'Replace with LM741 · Texas Instruments', 'Explicit replacement for this SPICE analysis; the native live circuit keeps its original IC. LM741 and LM324 behavior and supply requirements differ.'),
      ];
    }
    if (['DiodeElm', 'LEDElm', 'ZenerElm'].includes(nativeType)) choices = [modelChoice('1n4148', '1N4148 · ngspice model collection', 'Published switching-diode model; not an LED or zener substitute.'), modelChoice('generic-silicon', 'Generic silicon diode', 'Educational silicon-diode parameter set.'), modelChoice('rectifier', 'Educational rectifier', 'Rectifier parameter set with junction charge and breakdown; not a manufacturer part.')];
    if (/^(?:[NP])?TransistorElm$/.test(nativeType)) choices = Number(attrs.get('pn')) === -1 || nativeType === 'PTransistorElm' ? [modelChoice('generic-pnp', 'Generic PNP', 'Educational PNP model with beta from the native transistor; published part models retain their own parameters.'), modelChoice('bc556b', 'BC556B · Philips model', 'Published small-signal PNP model from the ngspice collection.')] : [modelChoice('generic-npn', 'Generic NPN', 'Educational NPN model with beta from the native transistor; published part models retain their own parameters.'), modelChoice('bc546b', 'BC546B · Philips model', 'Published small-signal NPN model from the ngspice collection.')];
    if (/^(?:[NP])?MosfetElm$/.test(nativeType)) choices = (Number(attrs.get('f')) & 1) || nativeType === 'PMosfetElm' ? [modelChoice('native-pmos', 'P-channel · level 1', 'Uses native threshold and beta in the standard SPICE level-1 model; no native parasitic extensions.'), modelChoice('irfp9240', 'IRFP9240 · power MOSFET', 'Published VDMOS model with capacitance and resistance; body must be tied to source.'), modelChoice('generic-pmos-90nm', 'CMOS90 PMOS', 'Bundled BSIM model, W=2µm L=90nm.')] : [modelChoice('native-nmos', 'N-channel · level 1', 'Uses native threshold and beta in the standard SPICE level-1 model; no native parasitic extensions.'), modelChoice('irfp240', 'IRFP240 · power MOSFET', 'Published VDMOS model with capacitance and resistance; body must be tied to source.'), modelChoice('generic-nmos-90nm', 'CMOS90 NMOS', 'Bundled BSIM model, W=1µm L=90nm.')];
    if (choices) models.push({ ...base, defaultModel: choices[0].id, choices });
  });
  return { sources, models };
}

/** Interoperability only: read CircuitJS's solved node IDs and exact exported values.
 * Unsupported models fail explicitly instead of substituting a different device model.
 * Editing, wiring, hit testing and native simulation remain owned by CircuitJS.
 */
export function circuitJsAnalysis(api: CircuitJsApi, settings: NativeAnalysisSettings) {
  const connectionError = api.ensureAnalyzed?.();
  if (connectionError) throw new Error('Fix the schematic before analysis: ' + connectionError);
  if (api.getStopMessage()) throw new Error('Fix the schematic before analysis: ' + api.getStopMessage());
  const topLevel = api.getElements();
  const elements = circuitJsAnalysisElements(api);
  const components: CircuitComponent[] = [];
  const nodePins = new Map<number, ConnectionPoint[]>();
  const labels = new Map<number, string>();
  const references: Record<string, number> = {};
  const options = circuitJsAnalysisOptions(api);
  const modelAssignments: { index: number; model: string; label: string }[] = [];
  const notes: string[] = [];
  const sourceIds = new Map<number, string>();
  // Keep native identity until the existing deck compiler has assigned its
  // actual device name. Internal block devices and synthetic IC rails have no
  // directly selectable schematic branch and must not be inferred by ordinal.
  const currentElements = new Map<string, CircuitJsElement>();
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
  for (const [elementIndex, element] of elements.entries()) {
    const type = element.getType();
    if (['WireElm', 'RoutedWireElm', 'OutputElm', 'ProbeElm', 'TextElm', 'TestPointElm', 'BoxElm', 'CustomCompositeElm'].includes(type)) continue;
    if (type === 'LabeledNodeElm') {
      if (elementIndex >= topLevel.length) continue; // Internal block labels can repeat across instances.
      const name = element.getLabelName();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) throw new Error('SPICE node labels must begin with a letter and use up to 32 letters, numbers and underscores.');
      const previous = labels.get(element.getNodeId(0));
      if (previous && previous.toLowerCase() !== name.toLowerCase()) throw new Error('Use one name for each electrical node before SPICE analysis.');
      labels.set(element.getNodeId(0), name); continue;
    }
    const attributes = attributesOf(element);
    const value = (key: string, fallback?: number) => {
      const raw = attributes.get(key), result = raw === undefined ? fallback : Number(raw);
      if (result === undefined || !Number.isFinite(result)) throw new Error('Invalid ' + type + ' parameter: ' + key);
      return result;
    };
    const id = 'native-' + (components.length + 1);
    const base = { id, position: { x: element.getPostX(0), y: element.getPostY(0) }, rotation: 0 as const };
    const choice = options.models.find(option => option.index === elementIndex);
    const model = settings.models?.[elementIndex] ?? choice?.defaultModel;
    if (choice) {
      const selected = choice.choices.find(candidate => candidate.id === model);
      if (!selected) throw new Error('Choose a compatible SPICE model for ' + choice.label + '.');
      if (selected.id === 'native-unmapped') throw new Error('The native LM324/IC has no matching bundled SPICE model. Use native live measurements or explicitly select a replacement in SPICE models; LM741 is not an equivalent LM324.');
      modelAssignments.push({ index: elementIndex, model: selected.id, label: selected.label });
      notes.push(choice.label + ': ' + selected.label + '. ' + selected.description);
    }
    if (type === 'GroundElm') {
      components.push({ ...base, reference: reference('GND'), kind: 'ground', parameters: {} }); terminal(element, id, ['gnd']);
    } else if (type === 'ResistorElm') {
      components.push({ ...base, reference: reference('R'), kind: 'resistor', parameters: { resistanceOhm: value('r') } }); terminal(element, id, ['a', 'b']);
    } else if (type === 'CapacitorElm' || type === 'PolarCapacitorElm') {
      const seriesResistance = value('sr', 0);
      if (seriesResistance < 0) throw new Error('Capacitor series resistance cannot be negative.');
      components.push({ ...base, reference: reference('C'), kind: 'capacitor', parameters: { capacitanceF: value('c'), initialVoltageV: value('iv', 0) } });
      if (seriesResistance === 0) terminal(element, id, ['a', 'b']);
      else {
        const internalNode = 1_000_000 + components.length;
        const resistorId = id + '-esr';
        components.push({ id: resistorId, reference: reference('R'), kind: 'resistor', position: base.position, rotation: 0, parameters: { resistanceOhm: seriesResistance } });
        bind(element.getNodeId(0), id, 'a'); bind(internalNode, id, 'b'); bind(internalNode, resistorId, 'a'); bind(element.getNodeId(1), resistorId, 'b');
        notes.push('Capacitor series resistance is retained as a series resistor in the SPICE circuit.');
      }
    } else if (type === 'InductorElm') {
      if (value('isat', 0) !== 0) throw new Error('SPICE conversion currently supports unsaturated inductors. Use live measurements for this model.');
      components.push({ ...base, reference: reference('L'), kind: 'inductor', parameters: { inductanceH: value('l'), initialCurrentA: value('ic', 0) } }); terminal(element, id, ['a', 'b']);
      if (elementIndex < topLevel.length) currentElements.set(id, element);
    } else if (sourceTypes.includes(type) && type !== 'CurrentElm') {
      const waveform = value('wf', 0), amplitude = value('maxv', 0), bias = value('bias', 0), phaseDeg = value('phaseShift', 0) * 180 / Math.PI;
      if (value('ir', 0) !== 0) throw new Error('For SPICE analysis, express source internal resistance as a separate series resistor.');
      const parameters: Extract<CircuitComponent, { kind: 'voltage-source' }>['parameters'] = { dcV: amplitude + bias };
      // Once the host can apply native stimuli, exported source state is the
      // authority. Later edits in CircuitJS must not be masked by stale UI data.
      let override = (api as Partial<AdvancedCircuitJsApi>).setSourceWaveform ? undefined : settings.sourceOverrides?.[elementIndex];
      const nativePwl = attributes.get('pwl');
      if (!override && nativePwl) {
        const numbers = nativePwl.trim().split(/\s+/).map(Number);
        if (numbers.length % 2) throw new Error('Native PWL data is incomplete.');
        let points = Array.from({ length: numbers.length / 2 }, (_, index) => ({ timeS: numbers[index * 2], value: numbers[index * 2 + 1] }));
        const repeatPeriod = value('pwlr', 0);
        if (repeatPeriod > 0) points = repeatPwlPoints(points, repeatPeriod, settings.duration + (settings.settleDuration ?? 0));
        override = { type: 'pwl', points };
      }
      if (override?.type === 'dc') parameters.dcV = override.value;
      else if (override?.type === 'pwl' || override?.type === 'bitstream') {
        const points = stimulusPoints(override, settings.duration + (settings.settleDuration ?? 0));
        parameters.dcV = points[0].value; parameters.transient = { type: 'pwl', points };
      } else if (override?.type === 'sine' || waveform === 1) {
        const sourceAmplitude = override?.type === 'sine' ? override.amplitude : amplitude;
        const sourcePhase = (override?.type === 'sine' ? override.phaseDeg ?? 0 : phaseDeg) + (sourceAmplitude < 0 ? 180 : 0);
        parameters.dcV = override?.type === 'sine' ? override.offset : bias;
        parameters.ac = { magnitude: Math.abs(sourceAmplitude), phaseDeg: sourcePhase };
        parameters.transient = { type: 'sine', offset: parameters.dcV, amplitude: Math.abs(sourceAmplitude), frequencyHz: override?.type === 'sine' ? override.frequencyHz : value('fr'), delayS: 0, dampingPerS: 0, phaseDeg: sourcePhase };
      } else if (waveform === 2 || waveform === 5) {
        const period = 1 / value('fr'), duty = value('dutyCycle', .5);
        const edge = Math.max(period * 1e-6, Math.min(value('riseTime', 0) || period * 1e-6, period * .01));
        if (value('phaseShift', 0) !== 0) throw new Error('Set square/pulse phase to zero, or choose explicit PWL points for phase-shifted pulses.');
        parameters.dcV = (waveform === 2 ? -amplitude : 0) + bias;
        parameters.transient = { type: 'pulse', low: parameters.dcV, high: amplitude + bias, delayS: 0, riseS: edge, fallS: edge, widthS: period * duty - edge, periodS: period };
      } else if (waveform !== 0 || type === 'DataInputElm') throw new Error('Choose explicit PWL or bitstream settings for ' + type.replace(/Elm$/, '') + ' before SPICE analysis.');
      if (settings.acSource !== undefined) parameters.ac = settings.acSource === elementIndex ? { magnitude: settings.acMagnitude ?? 1, phaseDeg: settings.acPhaseDeg ?? 0 } : undefined;
      components.push({ ...base, reference: reference('V'), kind: 'voltage-source', parameters });
      if (elementIndex < topLevel.length) currentElements.set(id, element);
      sourceIds.set(elementIndex, id);
      if (element.getPostCount() === 1) { terminal(element, id, ['positive']); bind(0, id, 'negative'); }
      else terminal(element, id, ['negative', 'positive']);
    } else if (type === 'CurrentElm') {
      if (value('mv', 0) !== 0) throw new Error('SPICE conversion supports ideal current sources without a compliance limit. Use live measurements for this source.');
      if (settings.sourceOverrides?.[elementIndex]) throw new Error('Programmed waveforms currently apply to voltage sources. Use a voltage source and transconductance stage for programmed current.');
      components.push({ ...base, reference: reference('I'), kind: 'current-source', parameters: { dcA: value('cu'), ...(settings.acSource === elementIndex ? { ac: { magnitude: settings.acMagnitude ?? 1, phaseDeg: settings.acPhaseDeg ?? 0 } } : {}) } }); terminal(element, id, ['positive', 'negative']);
      sourceIds.set(elementIndex, id);
    } else if (type === 'AnalogSwitchElm') {
      if ((value('f', 0) & 2) !== 0) throw new Error('Disable the analog switch’s pull-down option for SPICE analysis; this option has a different leakage circuit.');
      components.push({ ...base, reference: reference('S'), kind: 'voltage-controlled-switch', parameters: { onResistanceOhm: value('ron'), offResistanceOhm: value('roff'), thresholdV: value('th'), inverted: (value('f', 0) & 1) !== 0 } });
      terminal(element, id, ['a', 'b', 'controlPositive']); bind(0, id, 'controlNegative');
    } else if (type === 'OpAmpElm' || type === 'OpAmpRealElm') {
      if (model === 'native-ideal') {
        components.push({ ...base, reference: reference('U'), kind: 'op-amp-ideal', parameters: { openLoopGain: value('ga', 100000), outputMinV: value('mi', -15), outputMaxV: value('ma', 15) } });
        terminal(element, id, ['inverting', 'nonInverting', 'output']);
      } else {
        components.push({ ...base, reference: reference('U'), kind: 'op-amp-model', parameters: { model: 'lm741' } });
        if (element.getPostCount() === 5) terminal(element, id, ['inverting', 'nonInverting', 'output', 'positiveSupply', 'negativeSupply']);
        else {
          terminal(element, id, ['inverting', 'nonInverting', 'output']);
          for (const [pin, supply] of [['positiveSupply', value('ma', 15)], ['negativeSupply', value('mi', -15)]] as const) {
            const supplyId = id + '-' + (pin === 'positiveSupply' ? 'vp' : 'vn'), syntheticNode = 1_000_000 + components.length;
            components.push({ id: supplyId, reference: reference('V'), kind: 'voltage-source', position: base.position, rotation: 0, parameters: { dcV: supply } });
            bind(syntheticNode, id, pin); bind(syntheticNode, supplyId, 'positive'); bind(0, supplyId, 'negative');
          }
          notes.push('LM741 implicit power rails use this three-terminal symbol’s output-limit settings; use a five-terminal real op-amp to wire its supplies explicitly.');
        }
      }
    } else if (['DiodeElm', 'LEDElm', 'ZenerElm'].includes(type)) {
      if (type !== 'DiodeElm' && settings.models?.[elementIndex] === undefined) throw new Error('Select an explicit SPICE diode model; an LED or zener is not automatically replaced with a silicon diode.');
      components.push({ ...base, reference: reference('D'), kind: 'diode', parameters: { model: model as '1n4148' | 'generic-silicon' | 'rectifier', area: 1 } }); terminal(element, id, ['anode', 'cathode']);
    } else if (/^(?:[NP])?TransistorElm$/.test(type)) {
      const pnp = value('pn', type === 'PTransistorElm' ? -1 : 1) === -1;
      if (pnp) components.push({ ...base, reference: reference('Q'), kind: 'bjt-pnp', parameters: { model: model as 'generic-pnp' | 'bc556b', area: 1, ...(model === 'generic-pnp' ? { beta: value('be', 100) } : {}) } });
      else components.push({ ...base, reference: reference('Q'), kind: 'bjt-npn', parameters: { model: model as 'generic-npn' | 'bc546b', area: 1, ...(model === 'generic-npn' ? { beta: value('be', 120) } : {}) } });
      terminal(element, id, ['base', 'collector', 'emitter']);
    } else if (/^(?:[NP])?MosfetElm$/.test(type)) {
      const pmos = (value('f', 0) & 1) !== 0 || type === 'PMosfetElm';
      const nativeModel = model === 'native-nmos' || model === 'native-pmos';
      const parameters = { model, widthM: pmos ? 2e-6 : 1e-6, lengthM: 90e-9, multiplier: 1,
        ...(nativeModel ? { thresholdV: (pmos ? -1 : 1) * Math.abs(value('vt')), beta: value('be') } : {}) };
      components.push({ ...base, reference: reference('M'), kind: pmos ? 'mosfet-pmos' : 'mosfet-nmos', parameters } as CircuitComponent);
      // Native post 0=gate; source/drain placement is reversed for P-channel.
      const pins = pmos ? ['gate', 'drain', 'source'] : ['gate', 'source', 'drain'];
      if (element.getPostCount() === 4) pins.push('body');
      terminal(element, id, pins);
      if (pins.length === 3) bind(element.getNodeId(pmos ? 2 : 1), id, 'body');
    } else throw new Error(type.replace(/Elm$/, '') + ' is not supported by SPICE conversion yet. Use native live measurements for this component.');
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
  const selectedSourceId = settings.dcSource === undefined ? sourceIds.values().next().value : sourceIds.get(settings.dcSource);
  const source = components.find(component => component.id === selectedSourceId);
  let analysis: CircuitAnalysis;
  const common = { id: 'native-analysis', name: 'Current schematic' };
  switch (settings.type) {
    case 'operating-point': analysis = { ...common, type: 'operating-point' }; break;
    case 'ac-sweep':
      if (!components.some((component) => (component.kind === 'voltage-source' || component.kind === 'current-source') && component.parameters.ac?.magnitude)) throw new Error('Choose an AC test source and a nonzero AC magnitude. A DC source can also carry the AC test stimulus.');
      analysis = { ...common, type: 'ac-sweep', scale: settings.acScale ?? 'decade', points: settings.acPoints ?? 60, startHz: settings.startHz, stopHz: settings.stopHz }; break;
    case 'dc-sweep':
      if (!source) throw new Error('Add a voltage or current source to sweep.');
      analysis = { ...common, type: 'dc-sweep', sourceComponentId: source.id, start: settings.dcStart, stop: settings.dcStop, step: settings.dcStep }; break;
    default: {
      if (!Number.isInteger(settings.samples) || settings.samples < 2 || settings.samples > SIMULATOR_NETLIST_LIMITS.outputPoints) throw new Error(`Choose 2–${SIMULATOR_NETLIST_LIMITS.outputPoints.toLocaleString()} transient samples.`);
      const settleDuration = settings.settleDuration ?? 0;
      if (!Number.isFinite(settleDuration) || settleDuration < 0 || settleDuration + settings.duration > 10) throw new Error('Capture and settling time together must be at most 10 seconds.');
      // ngspice's first retained point is after TSTART. Reserve N accepted
      // intervals for a settled N-point record rather than assuming a TSTART sample.
      const stepS = settings.duration / (settings.samples - (settleDuration ? 0 : 1));
      analysis = { ...common, type: 'transient', stepS, stopS: settings.duration + settleDuration, startS: settleDuration, ...(settleDuration ? { maxStepS: stepS } : {}) };
    }
  }
  const document = circuitDocumentSchema.parse({ version: 1, id: 'native-analysis', title: 'Current CircuitJS schematic', revision: 0, components, junctions: [], wires, netLabels, probes, analyses: [analysis], settings: { gridSize: 16, snapToGrid: true } });
  let generated: ReturnType<typeof generateSpiceDeckFromCircuitDocument>;
  try { generated = generateSpiceDeckFromCircuitDocument(document); }
  catch (error) {
    if (error instanceof CircuitDocumentError) throw new Error(error.diagnostics.filter(item => item.severity === 'error').slice(0, 4).map(item => item.message).join(' ') || error.message, { cause: error });
    throw error;
  }
  const currentBindings = [...currentElements].map(([componentId, element]) => {
    const name = generated.deviceNameByComponentId[componentId];
    if (!name) throw new Error('The compiled current branch is missing its device name.');
    return { element, expression: `I(${name})` };
  });
  return { document, deck: generated.deck, probes: Object.values(generated.probeExpressions), currentBindings, modelAssignments, notes };
}
