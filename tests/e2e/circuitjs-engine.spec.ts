import { expect, test } from '@playwright/test';
import { challenges } from '../../lib/challenges';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
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
    console.log(`Validating native circuit: ${challenge.slug}`);
    const text = challenge.nativeCircuit ?? CIRCUITJS_STARTERS[challenge.slug];
    expect(text, `${challenge.slug} requires a native schematic`).toBeTruthy();
    const readings = await page.evaluate(async ({ text, stopAt }) => {
      const api = (window as unknown as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1;
      return new Promise<{ stop: string | null; time: number; elements: Array<{ type: string; dump: string; nodes: number[]; voltages: number[]; xs: number[]; ys: number[]; label: string }> }>((resolve, reject) => {
        const timeout = setTimeout(() => { api.setSimRunning(false); reject(new Error(api.getStopMessage() ?? 'CircuitJS did not advance.')); }, 5000);
        api.importCircuit(text, false); api.setMaxTimeStep(Math.min(1e-6, stopAt / 100));
        api.ontimestep = () => {
          if (api.getTime() < stopAt) return;
          api.ontimestep = undefined; api.setSimRunning(false); clearTimeout(timeout);
          try {
          resolve({ stop: api.getStopMessage(), time: api.getTime(), elements: api.getElements().map((element) => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), voltages: Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '' })) });
          } catch (error) { reject(error); }
        };
        api.setSimRunning(true);
      });
    }, { text, stopAt: challenge.slug === 'mosfet-gate-drive' ? 3e-7 : challenge.slug === 'transimpedance-stability' ? 1e-6 : 1e-4 });
    expect(readings.stop, challenge.slug).toBeFalsy();
    expect(readings.elements.length, challenge.slug).toBeGreaterThan(2);
    for (const element of readings.elements) {
      expect(element.nodes.every((node) => node >= 0), `${challenge.slug}: ${element.type} has native node IDs`).toBeTruthy();
      expect(element.voltages.every(Number.isFinite), `${challenge.slug}: ${element.type} has real solved voltages`).toBeTruthy();
    }
    if (challenge.judge) {
      const nativeElements: CircuitJsElement[] = readings.elements.map((element) => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post) => element.nodes[post], getVoltage: (post) => element.voltages[post], getPostX: (post) => element.xs[post], getPostY: (post) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label, getInfo: () => [], getVoltageDiff: () => 0, getCurrent: () => 0 }));
      const document = circuitJsGradingDocument({ getElements: () => nativeElements, getStopMessage: () => null } as CircuitJsApi, challenge.slug);
      expect(compileCircuitDocument(document).components.length).toBe(challenge.slug === 'inverting-gain-stage' ? 5 : 4);
      const grade = gradeSolution(gradeRequestSchema.parse({ problemSlug: challenge.slug, problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument: document }));
      expect(grade.passed, `${challenge.slug}: ${grade.summary}`).toBeTruthy();
      const output = readings.elements.find((element) => element.label === 'vout')?.voltages[0];
      if (challenge.slug === 'precision-voltage-divider') expect(output).toBeCloseTo(2.5, 6);
      if (challenge.slug === 'inverting-gain-stage') expect(output).toBeCloseTo(-1, 4);
    }
  }
});
