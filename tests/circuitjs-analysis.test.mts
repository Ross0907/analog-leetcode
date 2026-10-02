import assert from 'node:assert/strict';
import test from 'node:test';
import { circuitJsAnalysis, circuitJsAnalysisOptions, type NativeAnalysisSettings } from '../lib/circuitjs-analysis';
import type { CircuitJsApi, CircuitJsElement } from '../lib/circuitjs';

const settings: NativeAnalysisSettings = { type: 'operating-point', duration: 0.01, samples: 65536, startHz: 10, stopHz: 100000, dcStart: 0, dcStop: 5, dcStep: 0.05 };
function element(type: string, nodes: number[], attrs = '', label = '') {
  return { getType: () => type, getNodeId: (post: number) => nodes[post], getPostCount: () => nodes.length,
    getPostX: () => 0, getPostY: () => 0, getLabelName: () => label, exportElement: () => '<element ' + attrs + '/>' } as unknown as CircuitJsElement;
}
function api(elements: CircuitJsElement[]) { return { getElements: () => elements, getStopMessage: () => null } as unknown as CircuitJsApi; }
function divider(resistance = 1000) { return [element('VoltageElm', [0, 1], 'wf="0" maxv="5"'), element('ResistorElm', [1, 2], 'r="1000"'), element('ResistorElm', [2, 0], 'r="' + resistance + '"'), element('LabeledNodeElm', [1], '', 'vin'), element('LabeledNodeElm', [2], '', 'vout')]; }

test('analysis maps native node IDs and polarity, rereading actual edited values', () => {
  const before = circuitJsAnalysis(api(divider()), settings);
  const after = circuitJsAnalysis(api(divider(2200)), settings);
  assert.match(before.deck, /V1 vin 0 DC 5e0/);
  assert.match(before.deck, /R1 vin vout 1e3/);
  assert.match(after.deck, /R2 vout 0 2\.2e3/);
  assert.deepEqual(before.probes, ['V(vin)', 'V(vout)']);
  assert.notEqual(before.deck, after.deck);
});

test('DC current and single-terminal rail sources preserve native current direction and implicit ground', () => {
  const native = api([element('RailElm', [1], 'wf="0" maxv="3.3"'), element('ResistorElm', [1, 2], 'r="1000"'), element('CurrentElm', [2, 0], 'cu="0.001"')]);
  const result = circuitJsAnalysis(native, settings);
  assert.match(result.deck, /V1 node1 0 DC 3\.3e0/);
  assert.match(result.deck, /I1 node2 0 DC 1e-3/);
});

test('linear AC, transient and source sweep use the same native graph and actual source parameters', () => {
  const native = api([element('VoltageElm', [0, 1], 'wf="1" maxv="2" bias="1" fr="1000" phaseShift="1.5707963267948966"'), element('ResistorElm', [1, 2], 'r="1000"'), element('CapacitorElm', [2, 0], 'c="1e-7" iv="0"'), element('LabeledNodeElm', [2], '', 'vout')]);
  assert.match(circuitJsAnalysis(native, { ...settings, type: 'ac-sweep' }).deck, /AC 2e0 9e1/);
  assert.match(circuitJsAnalysis(native, { ...settings, type: 'transient' }).deck, /SIN\(1e0 2e0 1e3 0 0 9e1\)/);
  assert.match(circuitJsAnalysis(native, { ...settings, type: 'dc-sweep' }).deck, /\.dc V1 0 5e0 5e-2/);
});

test('unsupported models and unconnected graphs fail instead of substituting a reference circuit', () => {
  assert.throws(() => circuitJsAnalysis(api([...divider(), element('TransformerElm', [1, 2, 0, 3])]), settings), /not supported by SPICE conversion/);
  assert.throws(() => circuitJsAnalysis(api([element('VoltageElm', [0, 1], 'wf="6" maxv="5"')]), settings), /explicit PWL or bitstream/);
  assert.throws(() => circuitJsAnalysis(api([element('ResistorElm', [1, 2], 'r="1000"')]), settings));
});

test('native opamp pins and declared output limits survive conversion; LM741 power pins remain explicit', () => {
  const input = element('VoltageElm',[0,1],'wf="0" maxv="0.1"');
  const opamp = element('OpAmpElm',[2,0,3],'ga="1000000" ma="15" mi="-15"');
  const native = api([input,opamp,element('ResistorElm',[1,2],'r="10000"'),element('ResistorElm',[3,2],'r="100000"'),element('ResistorElm',[3,0],'r="10000"')]);
  const ideal = circuitJsAnalysis(native,settings);
  assert.match(ideal.deck,/B_U1 node3 0 V=max\(-1\.5e1,min\(1\.5e1,1e6\*\(V\(0\)-V\(node2\)\)\)\)/);
  const real = circuitJsAnalysis(native,{...settings,models:{1:'lm741'}});
  assert.match(real.deck,/X_U1 0 node2 node1000002 node1000003 node3 LM741/);
  assert.equal(real.modelAssignments[0].model,'lm741');
  assert.match(real.notes.join(' '),/implicit power rails/);
  assert.throws(()=>circuitJsAnalysis(native,{...settings,models:{1:'bc546b'}}),/compatible SPICE model/);
});

test('native BJT and MOS polarities map the solver posts rather than symbol orientation', () => {
  const native=api([element('RailElm',[1],'wf="0" maxv="5"'),element('ResistorElm',[1,2],'r="1000"'),element('PTransistorElm',[0,2,1],'pn="-1" be="100"'),element('PMosfetElm',[0,2,1],'f="1" vt="1.5" be="0.02"')]);
  const result=circuitJsAnalysis(native,{...settings,models:{2:'bc556b'}});
  assert.match(result.deck,/Q1 node2 0 node1 BC556B/);
  assert.match(result.deck,/M1 node2 0 node1 node1 AC_NATIVE_M1/);
  assert.match(result.deck,/PMOS \(LEVEL=1 VTO=-1\.5e0 KP=2e-2\)/);
});

test('subcircuit analysis uses actual native flattened node IDs and avoids internal label collisions', () => {
  const source=element('VoltageElm',[0,1],'wf="0" maxv="5"'),block=element('CustomCompositeElm',[1,2]);
  const resistor1=element('ResistorElm',[1,2],'r="1000"'),resistor2=element('ResistorElm',[2,0],'r="1000"');
  const native={...api([source,block,element('LabeledNodeElm',[2],'','out')]),getAnalysisElements:()=>[source,resistor1,resistor2,element('LabeledNodeElm',[1],'','out')]};
  const result=circuitJsAnalysis(native,settings);
  assert.match(result.deck,/R1 node1 out 1e3/); assert.match(result.deck,/R2 out 0 1e3/);
  assert.equal(result.document.components.filter(component=>component.kind==='resistor').length,2);
});

test('internal opamps retain the native ideal default and expose model choice at the same flattened index', () => {
  const source=element('VoltageElm',[0,1],'wf="0" maxv=".1"'),block=element('CustomCompositeElm',[1,3]);
  const amplifier=element('OpAmpElm',[2,0,3],'ga="1000000" ma="15" mi="-15"');
  const resistor1=element('ResistorElm',[1,2],'r="10000"'),resistor2=element('ResistorElm',[3,2],'r="100000"');
  const native={...api([source,block,element('LabeledNodeElm',[3],'','out')]),getAnalysisElements:()=>[source,amplifier,resistor1,resistor2]};
  const options=circuitJsAnalysisOptions(native);
  assert.equal(options.models[0].index,3); assert.equal(options.models[0].defaultModel,'native-ideal');
  assert.match(options.models[0].label,/inside block/);
  const ideal=circuitJsAnalysis(native,settings);
  assert.match(ideal.deck,/B_U1 out 0/); assert.doesNotMatch(ideal.deck,/\.SUBCKT LM741/);
  const real=circuitJsAnalysis(native,{...settings,models:{3:'lm741'}});
  assert.match(real.deck,/X_U1 0 node2 .* out LM741/);
});

test('a five-terminal real opamp and saved passive block produce one macro-model with explicit supplies', () => {
  const source=element('VoltageElm',[0,1],'wf="0" maxv=".1"'),positive=element('RailElm',[4],'wf="0" maxv="15"'),negative=element('RailElm',[5],'wf="0" maxv="-15"');
  const amplifier=element('OpAmpRealElm',[2,0,3,4,5],'mt="0"');
  const block=element('CustomCompositeElm',[1,2,3]);
  const input=element('ResistorElm',[1,2],'r="10000"'),feedback=element('ResistorElm',[3,2],'r="100000"');
  const top=[source,positive,negative,amplifier,block];
  const native={...api(top),getAnalysisElements:()=>[source,positive,negative,amplifier,input,feedback]};
  const generated=circuitJsAnalysis(native,settings);
  assert.equal(generated.document.components.filter(component=>component.kind==='op-amp-model').length,1);
  assert.equal(generated.document.components.filter(component=>component.kind==='resistor').length,2);
  assert.equal(generated.document.components.filter(component=>component.kind.startsWith('bjt')).length,0);
  assert.match(generated.deck,/X_U1 0 node2 node4 node5 node3 LM741/);
  assert.doesNotMatch(generated.notes.join(' '),/implicit power rails/);
  assert.equal(circuitJsAnalysisOptions(native).models.length,1);
});

test('native LM324 variants require an explicit SPICE replacement instead of silently selecting LM741', () => {
  for (const modelType of [1,2]) {
    const native=api([
      element('RailElm',[1],'wf="0" maxv="1"'),element('RailElm',[4],'wf="0" maxv="15"'),element('RailElm',[5],'wf="0" maxv="-15"'),
      element('OpAmpRealElm',[3,1,3,4,5],`mt="${modelType}"`),element('ResistorElm',[3,0],'r="10000"'),
    ]);
    const options=circuitJsAnalysisOptions(native);
    assert.equal(options.models[0].defaultModel,'native-unmapped');
    assert.match(options.models[0].choices[0].label,/LM324/);
    assert.throws(()=>circuitJsAnalysis(native,settings),/explicitly select a replacement.*not an equivalent LM324/);
    const replacement=circuitJsAnalysis(native,{...settings,models:{3:'lm741'}});
    assert.match(replacement.deck,/X_U1 node1 node3 node4 node5 node3 LM741/);
    assert.match(replacement.notes.join(' '),/Explicit replacement.*native live circuit keeps its original IC/);
  }
});
