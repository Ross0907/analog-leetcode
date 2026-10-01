import { expect, test } from '@playwright/test';
import { challenges } from '../../lib/challenges';
import { CIRCUITJS_STARTERS, PARTS_ONLY_STARTERS } from '../../lib/circuitjs-starters';
import { circuitJsGradingDocument } from '../../lib/circuitjs-grading';
import { compileCircuitDocument } from '../../lib/circuit-document';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';
import { gradeRequestSchema, gradeSolution } from '../../lib/grader.server';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: 'off' });

test('all authored challenge circuits load in the actual CircuitJS solver with finite terminal readings', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050');
  await page.waitForFunction(() => Boolean((window as Window & { CircuitJS1?: CircuitJsApi }).CircuitJS1));
  for (const challenge of challenges) {
    if (challenge.starterMode === 'parts-only') continue; // Intentionally disconnected; verified separately below.
    console.log(`Validating native circuit: ${challenge.slug}`);
    const text = challenge.nativeCircuit ?? CIRCUITJS_STARTERS[challenge.slug];
    expect(text, `${challenge.slug} requires a native schematic`).toBeTruthy();
    const readings = await page.evaluate(async ({ text, stopAt }) => {
      const api = (window as unknown as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1;
      return new Promise<{ stop: string | null; time: number; elements: Array<{ type: string; dump: string; nodes: number[]; voltages: number[]; xs: number[]; ys: number[]; label: string }> }>((resolve, reject) => {
        const timeout = setTimeout(() => { api.setSimRunning(false); reject(new Error(api.getStopMessage() ?? 'CircuitJS did not advance.')); }, 5000);
        api.importCircuit(text, false); api.setMaxTimeStep(Math.min(1e-6, stopAt / 1000));
        api.ontimestep = () => {
          if (api.getTime() < stopAt) return;
          api.ontimestep = undefined; api.setSimRunning(false); clearTimeout(timeout);
          try {
          resolve({ stop: api.getStopMessage(), time: api.getTime(), elements: api.getElements().map((element) => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), voltages: Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '' })) });
          } catch (error) { reject(error); }
        };
        api.setSimRunning(true);
      });
    }, { text, stopAt: challenge.slug === 'mosfet-gate-drive' ? 3e-7 : ['transimpedance-stability', 'adc-acquisition-settling'].includes(challenge.slug) ? 1e-6 : challenge.slug === 'sample-hold-droop' ? .0011 : 1e-4 });
    expect(readings.stop, challenge.slug).toBeFalsy();
    expect(readings.elements.length, challenge.slug).toBeGreaterThan(2);
    for (const element of readings.elements) {
      expect(element.nodes.every((node) => node >= 0), `${challenge.slug}: ${element.type} has native node IDs`).toBeTruthy();
      expect(element.voltages.every(Number.isFinite), `${challenge.slug}: ${element.type} has real solved voltages`).toBeTruthy();
    }
    if (challenge.judge) {
      const nativeElements: CircuitJsElement[] = readings.elements.map((element) => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post) => element.nodes[post], getVoltage: (post) => element.voltages[post], getPostX: (post) => element.xs[post], getPostY: (post) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label, getInfo: () => [], getVoltageDiff: () => 0, getCurrent: () => 0, getEditableValue: () => null, setEditableValue: () => null }));
      const document = circuitJsGradingDocument({ getElements: () => nativeElements, getStopMessage: () => null } as CircuitJsApi, challenge.slug);
      expect(compileCircuitDocument(document).components.filter((component) => component.kind !== 'ground').length).toBe(challenge.slug === 'inverting-gain-stage' ? 4 : 3);
      const grade = gradeSolution(gradeRequestSchema.parse({ problemSlug: challenge.slug, problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument: document }));
      expect(grade.passed, `${challenge.slug}: ${grade.summary}`).toBeTruthy();
      const output = readings.elements.find((element) => element.label === 'vout')?.voltages[0];
      if (challenge.slug === 'precision-voltage-divider') expect(output).toBeCloseTo(2.5, 6);
      if (challenge.slug === 'inverting-gain-stage') expect(output).toBeCloseTo(-1, 4);
    }
    const labeledVoltage = (label: string) => readings.elements.find((element) => element.label === label)?.voltages[0];
    if (challenge.slug === 'r2r-dac-code') expect(labeledVoltage('dac')).toBeCloseTo(3.125, 5);
    if (challenge.slug === 'sar-trial-residue') expect(labeledVoltage('residue')).toBeCloseTo(.075, 5);
    // Upstream OpAmpElm retains a small non-zero saturation slope for Newton
    // convergence, so ideal 0/5 V comparator levels are checked within 0.5 mV.
    if (challenge.slug === 'adc-comparator-polarity') expect(labeledVoltage('out')).toBeCloseTo(5, 3);
    if (challenge.slug === 'flash-adc-thermometer') {
      expect(labeledVoltage('t1')).toBeCloseTo(5, 3); expect(labeledVoltage('t2')).toBeCloseTo(5, 3); expect(labeledVoltage('t3')).toBeCloseTo(0, 3);
    }
    if (challenge.slug === 'adc-acquisition-settling') expect(labeledVoltage('out')).toBeCloseTo(3.3 * (1 - Math.exp(-10)), 4);
    if (challenge.slug === 'sample-hold-droop') expect(labeledVoltage('out')).toBeCloseTo(2 * Math.exp(-.01), 3);
  }
});

test('parts-only native starters fail until wired, then the actual electrical graph passes server grading', async ({ page }) => {
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050');
  await page.waitForFunction(() => Boolean((window as Window & { CircuitJS1?: CircuitJsApi }).CircuitJS1));
  for (const [slug, starter] of Object.entries(PARTS_ONLY_STARTERS)) {
    for (const connected of [false, true]) {
      // Author wires in the upstream document format. Shared endpoints are
      // resolved by CircuitJS itself before the grading adapter sees them.
      const wires = '\nw 96 128 240 128 0\nw 368 128 368 192 0\nw 368 192 432 192 0\nw 96 288 96 384 0\nw 432 320 432 384 0\nw 432 192 512 192 0\n';
      const elements = await page.evaluate(async (text) => {
        const api = (window as unknown as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1;
        api.importCircuit(text, false); api.setMaxTimeStep(1e-6); api.setSimRunning(true);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { api.ontimestep = undefined; api.setSimRunning(false); reject(new Error(api.getStopMessage() ?? 'Native analysis timed out')); }, 5000);
          api.ontimestep = () => { if (api.getTime() >= 1e-4) { clearTimeout(timer); api.ontimestep = undefined; api.setSimRunning(false); resolve(); } };
        });
        return api.getElements().map((element) => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), voltages: Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '' }));
      }, connected ? starter + wires : starter);
      const nativeElements: CircuitJsElement[] = elements.map((element) => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post) => element.nodes[post], getVoltage: (post) => element.voltages[post], getPostX: (post) => element.xs[post], getPostY: (post) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label, getInfo: () => [], getVoltageDiff: () => 0, getCurrent: () => 0, getEditableValue: () => null, setEditableValue: () => null }));
      const api = { getElements: () => nativeElements, getStopMessage: () => null } as CircuitJsApi;
      if (!connected) {
        expect(() => circuitJsGradingDocument(api, slug)).toThrow(/wire|not connected|output junction/i);
        continue;
      }
      const document = circuitJsGradingDocument(api, slug);
      const result = gradeSolution(gradeRequestSchema.parse({ problemSlug: slug, problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument: document }));
      expect(result.passed, `${slug}: ${result.diagnostics.map((item) => item.value).join('; ')}`).toBeTruthy();
      expect(document.probes).toHaveLength(1);
      expect(document.components.filter((component) => component.kind === 'ground')).toHaveLength(2);
    }
  }
});
