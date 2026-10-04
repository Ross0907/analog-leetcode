import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Simulation } from 'eecircuit-engine';
import { challenges } from '../../lib/challenges';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import { circuitJsAnalysis, type NativeAnalysisSettings } from '../../lib/circuitjs-analysis';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { normalizeNgspiceResult } from '../../lib/simulator-results';
import { validateSimulatorNetlist } from '../../lib/simulator-netlist-policy';
import { computeSpectrum, measureWaveform } from '../../lib/waveform-analysis';
import { inspectFftSampling } from '../../lib/fft-sampling';

test('lesson15 native and ngspice spectra agree with the physical 1kHz high-pass response', async ({ page }) => {
  test.setTimeout(150000);
  const challenge = challenges.find(challenge => challenge.id === 15)!;
  expect(challenge.slug).toBe('rc-high-pass');
  const settings = { ...challenge.analysisDefaults, type: 'transient' } as NativeAnalysisSettings;
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true');
  await page.waitForFunction(() => Boolean((window as unknown as { CircuitJS1?: CircuitJsApi }).CircuitJS1?.resetSimulation));
  const native = await page.evaluate(async ({ circuit, settings }) => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    api.importCircuit(circuit, false);
    const error = api.ensureAnalyzed?.(); if (error) throw Error(error);
    const output = api.getElements().find(element => element.getType() === 'LabeledNodeElm' && element.getLabelName?.() === 'out');
    if (!output) throw Error('The actual high-pass output node is missing.');
    const modulePath = '/lib/circuitjs.ts';
    const { captureCircuitJs } = await import(modulePath);
    const payload = await captureCircuitJs(api, [{ id: 'out', name: 'V(out)', kind: 'voltage', element: output, post: 0, enabled: true, color: '#19a7ce' }], settings.duration, settings.samples, { restart: true }).result as SimulationPayload;
    return { payload, elements: api.getElements().map(element => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '' })) };
  }, { circuit: challenge.nativeCircuit ?? CIRCUITJS_STARTERS[challenge.slug]!, settings });
  const elements = native.elements.map(element => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post: number) => element.nodes[post], getPostX: (post: number) => element.xs[post], getPostY: (post: number) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label } as CircuitJsElement));
  const api = { getElements: () => elements, getStopMessage: () => null } as unknown as CircuitJsApi;
  const simulator = new Simulation(); await simulator.start();
  const deck = circuitJsAnalysis(api, settings).deck;
  simulator.setNetList(deck);
  const spice = normalizeNgspiceResult(await simulator.runSim(), validateSimulatorNetlist(deck), ['out'], [], 0);
  const ratio = 2 * Math.PI * 1000 * 10000 * 10e-9;
  const expectedPeak = ratio / Math.sqrt(1 + ratio * ratio);
  const summarize = (payload: SimulationPayload) => {
    const trace = payload.traces[0]!;
    const sampling = inspectFftSampling(payload.x), length = Math.min(8192, sampling.supportedLength);
    const fft = computeSpectrum(payload.x, trace.values, { length, window: 'hann', removeDc: true });
    const peak = fft.amplitudes.slice(1).reduce((best, value, i) => value > fft.amplitudes[best]! ? i + 1 : best, 1);
    const steady = measureWaveform(payload.x.flatMap((time, i) => time >= .003 ? [{ x: time, y: trace.values[i]! }] : []));
    return { sampling, length, binHz: fft.binWidth, peakHz: fft.frequencies[peak], peakV: fft.amplitudes[peak], peakDb: fft.decibels[peak], steady, warnings: fft.warnings };
  };
  const measured = { native: summarize(native.payload), ngspice: summarize(spice) };
  mkdirSync('artifacts/qa', { recursive: true });
  writeFileSync('artifacts/qa/lesson15-spectrum-measured.json', JSON.stringify({ lesson: challenge.slug, expectedPeak, expectedDb: 20 * Math.log10(expectedPeak), settings, measured, native: native.payload, deck, ngspice: spice }));
  await test.info().attach('lesson15-physical-spectrum-proof', { body: JSON.stringify({ expectedPeak, measured }, null, 2), contentType: 'application/json' });
  for (const result of Object.values(measured)) {
    expect(result.length).toBeGreaterThanOrEqual(4096);
    expect(Math.abs(result.peakHz! - 1000)).toBeLessThan(result.binHz / 2 + 1);
    expect(Math.abs(result.peakV! - expectedPeak)).toBeLessThan(.01);
    expect(Math.abs(result.steady.peakToPeak! / 2 - expectedPeak)).toBeLessThan(.002);
  }
  expect(Math.abs(measured.native.peakV! - measured.ngspice.peakV!)).toBeLessThan(.005);
});
