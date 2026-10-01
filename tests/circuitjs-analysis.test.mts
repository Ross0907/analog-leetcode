import assert from 'node:assert/strict';
import test from 'node:test';
import { circuitJsAnalysis, type NativeAnalysisSettings } from '../lib/circuitjs-analysis';
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
  assert.throws(() => circuitJsAnalysis(api([...divider(), element('MosfetElm', [1, 2, 0])]), settings), /no equivalent SPICE model/);
  assert.throws(() => circuitJsAnalysis(api([element('VoltageElm', [0, 1], 'wf="2" maxv="5"')]), settings), /DC and sine/);
  assert.throws(() => circuitJsAnalysis(api([element('ResistorElm', [1, 2], 'r="1000"')]), settings));
});
