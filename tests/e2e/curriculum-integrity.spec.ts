import { expect, test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Simulation } from 'eecircuit-engine';
import { challenges } from '../../lib/challenges';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import { circuitJsAnalysis, type NativeAnalysisSettings } from '../../lib/circuitjs-analysis';
import { applyNativeSource, type AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';
import { normalizeNgspiceResult } from '../../lib/simulator-results';
import { validateSimulatorNetlist } from '../../lib/simulator-netlist-policy';
import { curriculumVariants, verifyCurriculumAnswer } from '../fixtures/curriculum-witnesses';
import { circuitJsGradingDocument } from '../../lib/circuitjs-grading';
import { gradeRequestSchema, gradeSolution } from '../../lib/grader.server';

test.use({ video: 'off' });

test('every lesson compiles and solves its actual native graph with the declared analysis', async ({ page }) => {
  test.setTimeout(480_000);
  const simulator = new Simulation(); await simulator.start();
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050');
  await page.waitForFunction(() => Boolean((window as unknown as { CircuitJS1?: AdvancedCircuitJsApi }).CircuitJS1?.setSourceWaveform));
  const report: { slug: string; variant: string; error?: string; data?: unknown; points?: number }[] = [];
  for (const challenge of challenges) {
    for (const variant of curriculumVariants(challenge)) {
    console.log('Auditing actual native graph:', challenge.slug, variant.name);
    try {
      const settings = challenge.analysisDefaults as NativeAnalysisSettings;
      const commands: { index: number; kind: string; data: string; repeat: number }[] = [];
      const bridge = { setSourceWaveform: (index: number, kind: string, data: string, repeat: number) => { commands.push({ index, kind, data, repeat }); return null; } } as unknown as CircuitJsApi;
      for (const [index, source] of Object.entries(settings.sourceOverrides ?? {})) applyNativeSource(bridge, Number(index), source, settings.duration);
      const native = await page.evaluate(async ({ circuit, duration, commands }) => {
        const api = (window as unknown as { CircuitJS1: AdvancedCircuitJsApi }).CircuitJS1;
        api.importCircuit(circuit, false);
        for (const command of commands) { const error = api.setSourceWaveform(command.index, command.kind as 'dc' | 'sine' | 'pwl', command.data, command.repeat); if (error) throw Error(error); }
        api.setMaxTimeStep(duration / 4096);
        const top = api.getElements();
        const limits = top.map(element => Array.from({ length: element.getPostCount() }, () => ({ min: Infinity, max: -Infinity })));
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { api.ontimestep = undefined; api.setSimRunning(false); reject(Error(api.getStopMessage() ?? 'Native solver did not reach the lesson window.')); }, 10000);
          api.ontimestep = () => {
            top.forEach((element, index) => limits[index].forEach((range, post) => { const value = element.getVoltage(post); range.min = Math.min(range.min, value); range.max = Math.max(range.max, value); }));
            if (api.getTime() < duration) return;
            clearTimeout(timer); api.ontimestep = undefined; api.setSimRunning(false); resolve();
          };
          api.setSimRunning(true);
        });
        return { stop: api.getStopMessage(), elements: top.map((element, index) => ({ type: element.getType(), dump: element.exportElement(), nodes: Array.from({ length: element.getPostCount() }, (_, post) => element.getNodeId(post)), xs: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostX(post)), ys: Array.from({ length: element.getPostCount() }, (_, post) => element.getPostY(post)), label: element.getType() === 'LabeledNodeElm' ? element.getLabelName() : '', voltages: Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)), ranges: limits[index] })) };
      }, { circuit: variant.circuit ?? CIRCUITJS_STARTERS[challenge.slug], duration: settings.duration, commands });
      expect(native.stop, challenge.slug).toBeNull();
      const elements = native.elements.map(element => ({ getType: () => element.type, exportElement: () => element.dump, getNodeId: (post: number) => element.nodes[post], getPostX: (post: number) => element.xs[post], getPostY: (post: number) => element.ys[post], getPostCount: () => element.nodes.length, getLabelName: () => element.label } as CircuitJsElement));
      const api = { getElements: () => elements, getStopMessage: () => null, setSourceWaveform: () => null } as unknown as CircuitJsApi;
      if (variant.incomplete) {
        expect(() => circuitJsAnalysis(api, settings), 'disconnected parts cannot silently run a reference deck').toThrow();
        expect(() => circuitJsGradingDocument(api, challenge.slug)).toThrow();
        report.push({ slug: challenge.slug, variant: variant.name, data: { blockedUntilWired: true } });
        continue;
      }
      const targets = challenge.recommendedProbes ?? [challenge.probe];
      for (const label of targets) expect(native.elements.some(element => element.label === label), `${challenge.slug}: actual native probe ${label} exists`).toBeTruthy();
      expect(native.elements.every(element=>element.voltages.every(Number.isFinite)), 'native solver produces real finite voltages').toBeTruthy();
      if (challenge.analysis === 'Transient') {
        expect(native.elements.some(element=>targets.includes(element.label) && element.ranges.some(range=>range.max-range.min > 1e-4)), 'finite event must be visible within the lesson record').toBeTruthy();
      }
      if (challenge.analysis === 'Operating point') {
        for (const element of native.elements.filter(element=>targets.includes(element.label))) expect(element.ranges.every(range=>range.max-range.min < .001), 'DC lesson readings stay steady').toBeTruthy();
      }
      if (challenge.solution?.verification.kind === 'op') {
        const verification = challenge.solution.verification;
        const reading = (verification.sumNodes ?? [verification.node]).reduce((sum, node) => {
          const label = native.elements.find(element=>element.label===node);
          expect(label, 'worked answer must reference a real native node').toBeTruthy();
          return sum + label!.voltages[0];
        },0) * (verification.scale ?? 1) + (verification.offset ?? 0);
        expect(Math.abs(reading-challenge.solution.value), 'native DC readout agrees with the worked answer').toBeLessThanOrEqual(Math.abs(challenge.solution.value)*challenge.solution.tolerance);
      }
      if (challenge.judge) {
        const document = circuitJsGradingDocument(api, challenge.slug);
        expect(gradeSolution(gradeRequestSchema.parse({ problemSlug: challenge.slug, problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument: document })).passed, 'native circuit passes the real server topology/value grader').toBeTruthy();
      }
      const generated = circuitJsAnalysis(api, settings);
      const analysis = validateSimulatorNetlist(generated.deck);
      simulator.setNetList(generated.deck);
      const raw = await simulator.runSim();
      // Match the UI's actual graph probes: IC internal nodes are not exposed
      // as dozens of unrelated channels. These two objectives also need the
      // source branch current, which ngspice measured in the same run.
      const probes = [...generated.probes, ...(['diode-rectifier-ripple','mosfet-gate-drive'].includes(challenge.slug) ? ['I(V1)'] : [])];
      const payload = normalizeNgspiceResult(raw, analysis, probes, [], 0);
      const evidence = verifyCurriculumAnswer(challenge, payload, variant.name);
      report.push({ slug: challenge.slug, variant: variant.name, data: { native, deck: generated.deck, payload, evidence }, points: raw.numPoints });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.push({ slug: challenge.slug, variant: variant.name, error: message }); console.log('AUDIT ERROR', challenge.slug, variant.name, message);
    }
  }
  }
  mkdirSync('.tmp', { recursive: true }); writeFileSync('.tmp/curriculum-native-audit.json', JSON.stringify(report));
  const summary = report.map(row=>({ slug: row.slug, variant: row.variant, points: row.points, error: row.error, evidence: (row.data as { evidence?: unknown } | undefined)?.evidence }));
  await test.info().attach('actual-native-curriculum-evidence', { body: JSON.stringify(summary,null,2), contentType: 'application/json' });
  expect(new Set(report.map(row=>row.slug)).size).toBe(challenges.length);
  expect(report).toHaveLength(challenges.reduce((count,challenge)=>count+curriculumVariants(challenge).length,0));
  expect(report.filter(item => item.error).map(item => `${item.slug}: ${item.error}`)).toEqual([]);
});
