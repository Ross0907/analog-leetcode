import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Simulation } from 'eecircuit-engine';
import { challenges } from '../../lib/challenges';
import { circuitJsAnalysis, type NativeAnalysisSettings } from '../../lib/circuitjs-analysis';
import { applyNativeSource, type AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { normalizeNgspiceResult } from '../../lib/simulator-results';
import { validateSimulatorNetlist } from '../../lib/simulator-netlist-policy';
import { curriculumVariants } from '../fixtures/curriculum-witnesses';
import { computeSpectrum } from '../../lib/waveform-analysis';
import { inspectFftSampling, prepareFftRecord } from '../../lib/fft-sampling';

test.use({ video: 'off' });

test('every lesson produces honest finite FFTs from its actual native graph and ngspice transient', async ({ page }) => {
  test.setTimeout(480000);
  const simulator = new Simulation(); await simulator.start();
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true');
  await page.waitForFunction(() => Boolean((window as unknown as { CircuitJS1?: AdvancedCircuitJsApi }).CircuitJS1?.setSourceWaveform));
  const report: { slug: string; error?: string; native?: unknown; ngspice?: unknown }[] = [];
  const summarize = (payload: SimulationPayload) => {
    const sampling = inspectFftSampling(payload.x), length = sampling.supportedLength;
    expect(length).toBeGreaterThanOrEqual(64);
    const plan = prepareFftRecord(payload.x, length), started = performance.now();
    const channels = payload.traces.map(trace => {
      const fft = computeSpectrum(payload.x, trace.values, { length, window: 'hann', removeDc: true, record: plan });
      expect(fft.amplitudes).toHaveLength(length / 2 + 1);
      expect(fft.amplitudes.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(fft.decibels.every(Number.isFinite)).toBe(true);
      expect(fft.recordStart).toBeGreaterThanOrEqual(payload.x[0]! - sampling.largestStep * 1e-6);
      expect(fft.recordEnd).toBeLessThanOrEqual(payload.x.at(-1)!);
      const peak = fft.amplitudes.reduce((best, value, i) => value > fft.amplitudes[best]! ? i : best, 0);
      let minimum = Infinity, maximum = -Infinity, sum = 0, squareSum = 0;
      for (const value of trace.values) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); sum += value; squareSum += value * value; }
      const timeDomain = { minimum, maximum, sampleMean: sum / trace.values.length, sampleRms: Math.sqrt(squareSum / trace.values.length) };
      expect(fft.amplitudes[peak]!, 'Absolute FFT magnitude cannot exceed twice the measured signal range after DC removal').toBeLessThanOrEqual((maximum - minimum) * 2 + Math.max(1, Math.abs(maximum)) * 1e-10);
      if (maximum - minimum < Math.max(1, Math.abs(maximum)) * 1e-13) expect(fft.dominantFrequency, 'Constant voltage roundoff is not a resolved periodic signal').toBeNull();
      return { name: trace.name, length, spacing: fft.binWidth, timeDomain, peakHz: fft.frequencies[peak], peakAmplitude: fft.amplitudes[peak], peakDb: fft.decibels[peak], dominantHz: fft.dominantFrequency, start: fft.recordStart, end: fft.recordEnd, warnings: fft.warnings };
    });
    return { sampling, channels, acquisitionWarnings: payload.warnings, fftMilliseconds: performance.now() - started };
  };
  for (const challenge of challenges) {
    // Parts-only tasks use the already-audited actually wired native fixture.
    // The disconnected starter is never replaced in the learning application.
    const variant = curriculumVariants(challenge).find(variant => !variant.incomplete)!;
    console.log('FFT actual graph:', challenge.slug);
    try {
      const settings = { ...challenge.analysisDefaults, type: 'transient', samples: Math.min(32768, challenge.analysisDefaults?.samples ?? 8192) } as NativeAnalysisSettings;
      const commands: { index: number; kind: string; data: string; repeat: number }[] = [];
      const bridge = { setSourceWaveform: (index: number, kind: string, data: string, repeat: number) => { commands.push({ index, kind, data, repeat }); return null; } } as unknown as CircuitJsApi;
      for (const [index, source] of Object.entries(settings.sourceOverrides ?? {})) applyNativeSource(bridge, Number(index), source, settings.duration);
      const native = await page.evaluate(async ({ circuit, settings, commands, probes }) => {
        const api = (window as unknown as { CircuitJS1: AdvancedCircuitJsApi }).CircuitJS1;
        api.importCircuit(circuit, false);
        for (const command of commands) { const issue = api.setSourceWaveform(command.index, command.kind as 'dc' | 'sine' | 'pwl', command.data, command.repeat); if (issue) throw Error(issue); }
        const error = api.ensureAnalyzed?.(); if (error) throw Error(error);
        const active = probes.map((name, index) => {
          const element = api.getElements().find(element => element.getType() === 'LabeledNodeElm' && element.getLabelName() === name);
          if (!element) throw Error('Missing native label ' + name);
          return { id: name, name: `V(${name})`, kind: 'voltage' as const, element, post: 0, enabled: true, color: ['#19a7ce', '#e5ae36'][index % 2]! };
        });
        const modulePath = '/lib/circuitjs.ts', { captureCircuitJs } = await import(modulePath);
        const payload = await captureCircuitJs(api, active, settings.duration, settings.samples, { restart: true }).result as SimulationPayload;
        return { payload, elements: api.getElements().map(element => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '' })) };
      }, { circuit: variant.circuit!, settings, commands, probes: challenge.recommendedProbes ?? [challenge.probe] });
      const elements = native.elements.map(element => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post: number) => element.nodes[post], getPostX: (post: number) => element.xs[post], getPostY: (post: number) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label } as CircuitJsElement));
      const generated = circuitJsAnalysis({ getElements: () => elements, getStopMessage: () => null } as unknown as CircuitJsApi, settings);
      simulator.setNetList(generated.deck);
      const spice = normalizeNgspiceResult(await simulator.runSim(), validateSimulatorNetlist(generated.deck), generated.probes, [], 0);
      report.push({ slug: challenge.slug, native: summarize(native.payload), ngspice: summarize(spice) });
    } catch (cause) { report.push({ slug: challenge.slug, error: cause instanceof Error ? cause.message : String(cause) }); }
  }
  mkdirSync('artifacts/qa', { recursive: true }); writeFileSync('artifacts/qa/curriculum-fft-audit.json', JSON.stringify(report, null, 2));
  await test.info().attach('all-lesson-actual-FFT-audit', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report).toHaveLength(challenges.length);
  expect(report.filter(row => row.error)).toEqual([]);
});
