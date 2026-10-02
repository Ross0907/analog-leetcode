import assert from 'node:assert/strict';
import test from 'node:test';
import { AcquisitionBuffer, acquisitionCapacity, MAX_ACQUISITION_VALUES, startCircuitJsAcquisition } from '../lib/circuitjs-acquisition';
import type { CircuitJsApi, CircuitJsElement, CircuitJsProbe } from '../lib/circuitjs';

test('ring storage stays bounded and preserves actual chronological samples after wrapping', () => {
  const buffer = new AcquisitionBuffer(2, 128);
  const bytes = buffer.byteLength;
  for (let time = 0; time < 1000; time++) buffer.append(time, [time * 2, -time]);
  const snapshot = buffer.snapshot(Infinity);
  assert.equal(buffer.count, 128);
  assert.equal(buffer.totalSamples, 1000);
  assert.equal(buffer.byteLength, bytes);
  assert.deepEqual(snapshot.x, Array.from({ length: 128 }, (_, i) => i + 872));
  assert.deepEqual(snapshot.values[0], snapshot.x.map((time) => time * 2));
  assert.deepEqual(snapshot.values[1], snapshot.x.map((time) => -time));
  assert.deepEqual(buffer.snapshot(3).x, [996, 997, 998, 999]);
  assert.equal(buffer.append(999, [5, 6]), false);
  assert.throws(() => buffer.append(1001, [NaN, 2]), /invalid sample/);
});

test('131072 samples are available and many channels obey the combined memory budget', () => {
  assert.equal(acquisitionCapacity(2, 131072), 131072);
  assert.equal(acquisitionCapacity(32, 65536), Math.floor(MAX_ACQUISITION_VALUES / 33));
  assert.throws(() => acquisitionCapacity(33, 65536), /32 probes/);
  assert.throws(() => acquisitionCapacity(2, 131073), /131,072/);
});

function fixture() {
  let time = 0, voltage = 0, step = 0.01, previousCalls = 0;
  const runningCalls: boolean[] = [];
  const element = { getPostCount: () => 2, getNodeId: () => 7, getVoltage: () => voltage, getCurrent: () => -voltage / 1000 } as unknown as CircuitJsElement;
  const previous = () => { previousCalls++; };
  const api = { getElements: () => [element], getTime: () => time, getMaxTimeStep: () => step,
    setMaxTimeStep: (value: number) => { step = value; }, setSimRunning: (value: boolean) => runningCalls.push(value), ontimestep: previous } as unknown as CircuitJsApi;
  const probes: CircuitJsProbe[] = [{ id: 'vout', name: 'Output', kind: 'voltage', element, post: 1, color: '#34d399', enabled: true },
    { id: 'load', name: 'Load current', kind: 'current', element, post: 0, color: '#38bdf8', enabled: true }];
  return { api, probes, previous, runningCalls, previousCalls: () => previousCalls, step: () => step,
    tick: (nextTime: number, reading: number) => { time = nextTime; voltage = reading; api.ontimestep?.(api); } };
}

test('live acquisition chains native callbacks, samples actual values and freezes without pausing', () => {
  const native = fixture();
  const session = startCircuitJsAcquisition(native.api, native.probes, { duration: 1, samples: 128 });
  for (let i = 0; i < 400; i++) native.tick(i / 127, 3 + i * 0.002);
  const result = session.snapshot()!;
  assert.equal(result.engine, 'circuitjs1');
  assert.equal(result.x.length, 128);
  assert.equal(result.traces[0]!.values.at(-1), 3 + 399 * 0.002);
  assert.equal(result.traces[1]!.values.at(-1), -(3 + 399 * 0.002) / 1000);
  assert.equal(result.traces[1]!.unit, 'A');
  assert.equal(native.previousCalls(), 400);
  session.stop(); session.stop();
  assert.equal(native.api.ontimestep, native.previous);
  assert.equal(native.step(), 0.01);
  assert.deepEqual(native.runningCalls, [true]);
});

test('reset clears stale history, invalid readings stop acquisition, explicit timestep changes survive cleanup', () => {
  const native = fixture(); const errors: string[] = [];
  const session = startCircuitJsAcquisition(native.api, native.probes, { duration: 1, samples: 128, onError: (message) => errors.push(message) });
  native.tick(2, 4); native.tick(2.1, 5); native.tick(0, 8); native.tick(0.1, 9);
  assert.deepEqual(session.snapshot()!.x, [0, 0.1]);
  assert.deepEqual(session.snapshot()!.traces[0]!.values, [8, 9]);
  native.api.setMaxTimeStep(0.0001);
  native.tick(0.2, Infinity);
  assert.equal(session.stopped, true);
  assert.match(errors[0]!, /invalid sample/);
  assert.equal(native.step(), 0.0001);
  assert.deepEqual(native.runningCalls, [true]);
});

test('live capture samples accepted states across the time window and rejects graph edits', () => {
  const native = fixture(), errors: string[] = [];
  let revision = 1;
  native.api.getCircuitRevision = () => revision;
  const session = startCircuitJsAcquisition(native.api, native.probes, {duration:1, samples:128, onError:(message) => errors.push(message)});
  native.tick(0, 0); native.tick(1e-8, 1); native.tick(2e-8, 2); native.tick(.01, 3); native.tick(.02, 4);
  assert.deepEqual(session.snapshot()!.x, [0,.01,.02]);
  assert.deepEqual(session.snapshot()!.traces[0].values, [0,3,4]);
  revision++;
  native.tick(.03, 5);
  assert.equal(session.stopped, true);
  assert.equal(session.totalSamples, 3);
  assert.match(errors[0], /Circuit changed/);
});

test('dense adaptive steps do not evict the requested live time span', () => {
  const native = fixture();
  const session = startCircuitJsAcquisition(native.api, native.probes, { duration: 1, samples: 128 });
  for (let i = 0; i <= 10000; i++) native.tick(i / 10000, i / 10000);
  const result = session.snapshot()!;
  assert.equal(result.x[0], 0);
  assert.ok(result.x.at(-1)! > .99);
  assert.ok(result.x.length <= 128);
  assert.deepEqual(result.traces[0].values, result.x);
  session.stop();
});

test('one-record live acquisition pauses at its actual end and keeps the finite stimulus', () => {
  const native = fixture(); let completed = 0;
  const session = startCircuitJsAcquisition(native.api, native.probes, { duration: .1, samples: 128, record: true, onComplete: () => completed++ });
  for (let i = 0; i <= 150; i++) native.tick(i / 1000, i >= 30 && i < 60 ? 5 : 0);
  const result = session.snapshot()!;
  assert.equal(session.stopped, true);
  assert.equal(completed, 1);
  assert.equal(result.x[0], 0);
  assert.equal(result.x.at(-1), .1);
  assert.ok(result.traces[0].values.includes(5));
  assert.deepEqual(native.runningCalls, [true, false]);
});
