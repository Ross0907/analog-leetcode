import assert from 'node:assert/strict';
import test from 'node:test';
import type { CircuitJsApi, CircuitJsElement } from '../lib/circuitjs';
import { circuitJsAnalysis } from '../lib/circuitjs-analysis';
import { applyNativeSource } from '../lib/circuitjs-advanced';
import { repeatPwlPoints, stimulusPoints } from '../lib/native-stimulus';
import { SIMULATOR_NETLIST_LIMITS } from '../lib/simulator-netlist-policy';
import type { SimulatorWorkerMessage, SimulatorWorkerRequest } from '../lib/simulator-contract';

test('the actual worker retains a complete 65,536-target bitstream record from the native graph', { timeout: 15_000 }, async () => {
  function element(type: string, nodes: number[], attrs: string, label = '') {
    return { getType: () => type, getNodeId: (index: number) => nodes[index], getPostCount: () => nodes.length, getPostX: () => 0, getPostY: () => 0, getLabelName: () => label, exportElement: () => `<component ${attrs}/>` } as unknown as CircuitJsElement;
  }
  const points = stimulusPoints({ type: 'bitstream', bits: '0101', bitPeriodS: .001, low: 0, high: 5, riseS: 1e-6 }, .004);
  const elements = [element('VoltageElm', [0, 1], `wf="0" maxv="5" pwl="${points.flatMap(point => [point.timeS, point.value]).join(' ')}"`), element('ResistorElm', [1, 2], 'r="1000"'), element('ResistorElm', [2, 0], 'r="1000"'), element('LabeledNodeElm', [2], '', 'out')];
  const api = { getElements: () => elements, getStopMessage: () => null, setSourceWaveform: () => null } as unknown as CircuitJsApi;
  const settings = { type: 'transient', duration: .004, samples: 65_536, startHz: 10, stopHz: 1e5, dcStart: 0, dcStop: 5, dcStep: .1 } as const;
  const { deck } = circuitJsAnalysis(api, settings);
  assert.throws(() => circuitJsAnalysis(api, { ...settings, samples: 131_073 }), /transient samples/);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'self');
  let readyResolve: (message: SimulatorWorkerMessage) => void = () => {};
  let resultResolve: (message: SimulatorWorkerMessage) => void = () => {};
  const ready = new Promise<SimulatorWorkerMessage>(resolve => { readyResolve = resolve; });
  const result = new Promise<SimulatorWorkerMessage>(resolve => { resultResolve = resolve; });
  const scope = { onmessage: null as null | ((event: { data: SimulatorWorkerRequest }) => Promise<void>), postMessage: (message: SimulatorWorkerMessage) => { if (message.type === 'ready' || message.type === 'initialization-error') readyResolve(message); else resultResolve(message); } };
  Object.setPrototypeOf(scope, globalThis);
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope });
  try {
    await import('../app/workers/spice.worker');
    assert.equal((await ready).type, 'ready');
    await scope.onmessage!({ data: { type: 'run', id: 'full-bitstream', netlist: deck, probes: ['out'] } });
    const message = await result;
    assert.equal(message.type, 'result');
    if (message.type !== 'result') throw Error('Missing worker result');
    assert.equal(message.ok, true, !message.ok ? message.error : '');
    const { x, traces } = message.payload;
    assert.ok(x.length >= 65_536 && x.length <= SIMULATOR_NETLIST_LIMITS.adaptiveOutputPoints, `Actual record: ${x.length}`);
    assert.equal(x.at(-1), .004);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].values.length, x.length);
    for (const [at, expected] of [[.0005, 0], [.0015, 2.5], [.0025, 0], [.0035, 2.5]]) {
      const index = x.findIndex(time => time >= at);
      assert.ok(Math.abs(traces[0].values[index] - expected) < 1e-7, `Output at ${at}`);
    }
    console.log(`65,536-target worker capture preserved all ${x.length} actual samples in ${message.payload.runtimeMs.toFixed(0)} ms.`);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'self', previous); else Reflect.deleteProperty(globalThis, 'self');
  }
});

test('repeating bitstreams join adjacent high bits without glitches and reject an initial repeat delay', () => {
  const source = { type: 'bitstream', bits: '11', bitPeriodS: .001, low: 0, high: 5, riseS: 1e-6, repeat: true } as const;
  let native: { kind: string; data: string; period: number } | undefined;
  const api = { setSourceWaveform: (_index: number, kind: string, data: string, period: number) => { native = { kind, data, period }; return null; } } as unknown as CircuitJsApi;
  applyNativeSource(api, 0, source, .004);
  assert.ok(native);
  assert.equal(native.period, .002);
  const fields = native.data.split(' ').map(Number);
  const cycle = Array.from({ length: fields.length / 2 }, (_, index) => ({ timeS: fields[2 * index], value: fields[2 * index + 1] }));
  assert.deepEqual(cycle, [{ timeS: 0, value: 5 }, { timeS: .002, value: 5 }]);
  assert.ok(repeatPwlPoints(cycle, native.period, .004).every(point => point.value === 5));
  const mixed = stimulusPoints({ ...source, bits: '101' }, .003);
  assert.equal(mixed[0].value, 5);
  assert.equal(mixed.at(-1)?.value, 5);
  for (const bits of ['01', '010']) {
    const slowEdges = { ...source, bits, bitPeriodS: .1, riseS: .09 };
    applyNativeSource(api, 0, slowEdges, 1);
    const slowFields: number[] = native.data.split(' ').map(Number);
    assert.equal(slowFields.at(-2), native.period, 'A decimal period and long edge must end exactly at the repeat boundary.');
    const table = Array.from({ length: slowFields.length / 2 }, (_, index) => ({ timeS: slowFields[2 * index], value: slowFields[2 * index + 1] }));
    assert.doesNotThrow(() => repeatPwlPoints(table, native!.period, 1));
  }
  assert.throws(() => applyNativeSource(api, 0, { ...source, delayS: .001 }, .004), /zero start delay/);
});
