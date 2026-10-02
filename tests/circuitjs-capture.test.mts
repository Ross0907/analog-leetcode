import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCircuitJs, type CircuitJsApi, type CircuitJsElement, type CircuitJsProbe } from '../lib/circuitjs';

function simulator() {
  let time = 0, maxStep = 1e-6, running = false, revision = 1, steps = 0;
  const element = { getPostCount: () => 2, getVoltage: () => Math.sin(time * 1000), getCurrent: () => time / 1000, getNodeId: () => 1 } as unknown as CircuitJsElement;
  const api = {
    getElements: () => [element], getTime: () => time, getMaxTimeStep: () => maxStep,
    setMaxTimeStep: (step: number) => { maxStep = step; }, getCircuitRevision: () => revision,
    setSimRunning: (value: boolean) => { running = value; }, isRunning: () => running, getStopMessage: () => null,
    stepSimulation: (limit: number) => { let count = 0; while (running && count < limit) { time += maxStep; steps++; count++; api.ontimestep?.(api as unknown as CircuitJsApi); } return count; },
    ontimestep: undefined as CircuitJsApi['ontimestep'],
  };
  const probe: CircuitJsProbe = { id: 'v1', name: 'Out', kind: 'voltage', element, post: 0, color: '#000', enabled: true };
  return { api: api as unknown as CircuitJsApi, probe, edit: () => revision++, steps: () => steps };
}

test('65,536 capture keeps all accepted native batch samples and yields progress', async () => {
  const { api, probe, steps } = simulator();
  const progress: number[] = [];
  const payload = await captureCircuitJs(api, [probe], 0.001, 65536, { onProgress: (state) => progress.push(state.samples) }).result;
  assert.equal(payload.x.length, steps());
  assert.equal(payload.x.length, 65536);
  assert.equal(payload.traces[0].values.length, payload.x.length);
  for (let index = 0; index < payload.x.length; index++) assert.equal(payload.traces[0].values[index], Math.sin(payload.x[index] * 1000));
  assert.equal(progress.at(-1), payload.x.length);
  assert.equal(api.getMaxTimeStep(), 1e-6);
  assert.equal(api.isRunning(), false);
});

test('capture cancels between bounded batches and restores its own hook', async () => {
  const { api, probe } = simulator();
  const capture = captureCircuitJs(api, [probe], 1, 65536);
  capture.cancel();
  await assert.rejects(capture.result, /cancelled/);
  assert.equal(api.ontimestep, undefined);
  assert.equal(api.getMaxTimeStep(), 1e-6);
});

test('same-object graph edit invalidates capture before stale readings', async () => {
  const { api, probe, edit, steps } = simulator();
  const capture = captureCircuitJs(api, [probe], 1, 65536);
  edit();
  await assert.rejects(capture.result, /Circuit changed/);
  assert.equal(steps(), 0);
});

test('capture preserves user timestep edits and reports native convergence stops', async () => {
  const { api, probe } = simulator();
  const capture = captureCircuitJs(api, [probe], 1, 65536);
  api.setMaxTimeStep(0.2);
  api.getStopMessage = () => 'Singular matrix';
  await assert.rejects(capture.result, /Singular matrix/);
  assert.equal(api.getMaxTimeStep(), 0.2);
});
