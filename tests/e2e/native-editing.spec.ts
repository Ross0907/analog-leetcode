import { test, expect, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import type { AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';

declare global { interface Window { CircuitJS1: CircuitJsApi; AnaCodeKiCad?: { ready: boolean } } }

const divider = `$ 4 0.000005 10.20027730826997 50 5 50 5e-11
v 96 240 96 80 0 0 40 10 0 0 0.5
w 96 80 160 80 0
r 160 80 320 80 0 1000
r 320 80 320 240 0 1000
w 320 240 96 240 0
g 96 240 96 288 0`;

async function open(page: Page, text = divider, showInfo = false) {
  page.on('pageerror', (error) => console.error('Native runtime:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Native asset:', message.text()); });
  // An explicit startup document prevents the asynchronous upstream example menu
  // from loading its default RLC circuit after this test imports its fixture.
  const emptyCircuit = encodeURIComponent('$ 4 0.000001 10 50 5 50 5e-11');
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=${!showInfo}&cct=${emptyCircuit}`);
  await expect.poll(() => page.evaluate(() => typeof window.CircuitJS1?.setTheme === 'function' && window.AnaCodeKiCad?.ready === true)).toBe(true);
  expect(await page.evaluate(() => window.CircuitJS1.getElements().length)).toBe(0);
  await page.evaluate((text) => { window.CircuitJS1.importCircuit(text, false); window.CircuitJS1.setTheme('light'); window.CircuitJS1.setSimRunning(true); }, text);
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().length)).toBeGreaterThan(0);
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => { const rect = document.querySelector('canvas')!.getBoundingClientRect(); return { x: rect.left + window.CircuitJS1.screenX(x), y: rect.top + window.CircuitJS1.screenY(y) }; }, { x, y });
}
const output = (page: Page) => page.evaluate(() => window.CircuitJS1.getElements().find((element) => element.getType() === 'ResistorElm' && element.getPostX(0) === 320 && element.getPostY(1) === 240)?.getVoltage(0));

test('moving a component keeps legacy wires and directly attached parts electrically connected', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  const start = await point(page, 240, 80), end = await point(page, 240, 144);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.waitForTimeout(180);
  await page.mouse.move(end.x, end.y, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().some((element) => element.getType() === 'ResistorElm' && element.getPostX(0) === 160 && element.getPostY(0) === 144))).toBe(true);
  await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  expect(await page.evaluate(() => window.CircuitJS1.getElements().some((element) => element.getType() === 'RoutedWireElm'))).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().some((element) => element.getType() === 'ResistorElm' && element.getPostX(0) === 160 && element.getPostY(0) === 80))).toBe(true);
  await expect.poll(() => output(page)).toBeCloseTo(5, 6);
});

test('W immediately draws click-to-click orthogonal wiring and one-click junctions on both wire interiors', async ({ page }) => {
  await open(page, `$ 4 0.000005 10.20027730826997 50 5 50 5e-11
v 64 256 64 128 0 0 40 5 0 0 0.5
w 64 128 192 128 0
w 256 224 384 224 0
r 384 224 384 304 0 1000
w 384 304 64 304 0
w 64 256 64 304 0
g 64 304 64 352 0`);
  const initial = await page.evaluate(() => window.CircuitJS1.exportCircuit());
  const start = await point(page, 128, 128), end = await point(page, 320, 224);
  await page.locator('canvas').focus(); await page.keyboard.press('w');
  await expect(page.locator('canvas')).toHaveCSS('cursor', 'crosshair');
  await page.mouse.click(start.x, start.y); await page.mouse.move(end.x, end.y, { steps: 7 }); await page.mouse.click(end.x, end.y);
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().find((element) => element.getType() === 'ResistorElm')?.getVoltage(0))).toBeCloseTo(5, 6);
  const state = await page.evaluate(() => ({ xml: window.CircuitJS1.exportCircuit(), ends: window.CircuitJS1.getElements().flatMap((element) => Array.from({ length: element.getPostCount() }, (_, i) => [element.getPostX(i), element.getPostY(i), element.getNodeId(i)])) }));
  expect(state.ends.filter(([x, y]) => x === 128 && y === 128).length).toBe(3);
  expect(state.ends.filter(([x, y]) => x === 320 && y === 224).length).toBe(3);
  const route = await page.evaluate((xml) => new DOMParser().parseFromString(xml, 'application/xml').querySelector('rw')?.textContent?.trim().split(';').map((point) => point.split(',').map(Number)), state.xml);
  expect(route?.length).toBeGreaterThanOrEqual(3);
  route?.slice(1).forEach((point, i) => expect(point[0] === route[i][0] || point[1] === route[i][1]).toBe(true));
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.exportCircuit())).toBe(initial);
});

test('component value text edits inline, validates, and updates the actual native solution', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  const value = await point(page, 240, 60); await page.mouse.dblclick(value.x, value.y);
  const input = page.getByRole('textbox', { name: 'Resistance (ohms)', exact: true });
  await expect(input).toBeVisible(); await input.fill('0'); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('greater than zero');
  await input.fill('2k'); await input.press('Enter'); await expect(input).toBeHidden();
  await expect.poll(() => output(page)).toBeCloseTo(10 / 3, 5);
  await page.keyboard.press('Control+z'); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
});

test('light and dark themes apply to the native canvas and inline editor', async ({ page }) => {
  await open(page);
  await expect(page.locator('canvas')).toHaveCSS('background-color', 'rgb(250, 251, 252)');
  await page.evaluate(() => window.CircuitJS1.setTheme('dark'));
  await expect(page.locator('canvas')).toHaveCSS('background-color', 'rgb(23, 25, 29)');
  const value = await point(page, 240, 60); await page.mouse.dblclick(value.x, value.y);
  const input = page.getByRole('textbox', { name: 'Resistance (ohms)', exact: true });
  await expect(input).toBeVisible(); await expect(input).toHaveCSS('color', 'rgb(210, 216, 223)');
  await expect(input).toHaveCSS('background-color', 'rgb(23, 25, 29)');
  await input.press('Escape');
  const body = await point(page, 240, 80); await page.mouse.dblclick(body.x, body.y);
  const dialog = page.locator('.gwt-DialogBox');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.Caption')).toHaveCSS('color', 'rgb(210, 216, 223)');
  await expect(dialog.locator('.Caption')).toHaveCSS('background-color', 'rgb(32, 36, 43)');
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await page.evaluate(() => window.CircuitJS1.setTheme('light'));
  await page.screenshot({ path: '.tmp/native-editing-light.png', fullPage: true });
});

test('wire placement supports empty-space endpoints and Escape cancels an unfinished wire', async ({ page }) => {
  await open(page);
  const count = await page.evaluate(() => window.CircuitJS1.getElements().length);
  const start = await point(page, 400, 96), end = await point(page, 480, 160);
  await page.evaluate(() => window.CircuitJS1.startWire());
  await page.mouse.click(start.x, start.y); await page.mouse.move(end.x, end.y);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.CircuitJS1.getElements().length)).toBe(count);
  await page.keyboard.press('w');
  await page.mouse.click(start.x, start.y); await page.mouse.move(end.x, end.y); await page.mouse.click(end.x, end.y);
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().some((element) => element.getType() === 'RoutedWireElm' && element.getPostX(0) === 400 && element.getPostY(0) === 96 && element.getPostX(1) === 480 && element.getPostY(1) === 160))).toBe(true);
});

test('source labels edit their displayed voltage or frequency using native fields', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  let value = await point(page, 64, 160); await page.mouse.dblclick(value.x, value.y);
  let input = page.getByRole('textbox', { name: 'Voltage', exact: true });
  await expect(input).toBeVisible(); await input.fill('8'); await input.press('Enter');
  await expect.poll(() => output(page)).toBeCloseTo(4, 6);
  await page.evaluate((text) => window.CircuitJS1.importCircuit(text, false), divider.replace('0 0 40 10 0 0 0.5', '0 1 1000 10 0 0 0.5'));
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements()[0].getEditableValue()?.name)).toBe('Frequency (Hz)');
  value = await point(page, 64, 160); await page.mouse.dblclick(value.x, value.y);
  input = page.getByRole('textbox', { name: 'Frequency (Hz)', exact: true });
  await expect(input).toBeVisible(); await input.fill('2k'); await input.press('Enter');
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements()[0].getEditableValue()?.value)).toBe(2000);
});

test('solver information backing remains readable in light and dark themes', async ({ page }) => {
  await open(page, divider, true);
  await page.mouse.move(10, 10);
  const backing = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    return Array.from(canvas.getContext('2d')!.getImageData(canvas.width - 20, canvas.height - 20, 1, 1).data);
  });
  await expect.poll(backing).toEqual([237, 242, 247, 255]);
  await page.evaluate(() => window.CircuitJS1.setTheme('dark'));
  await expect.poll(backing).toEqual([32, 36, 43, 255]);
});

test('native batch solver records 65,536 real samples without animation throttling', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  const result = await page.evaluate(async () => {
    const api = window.CircuitJS1, resistor = api.getElements().find((element) => element.getType() === 'ResistorElm' && element.getPostX(0) === 320)!;
    if (!api.stepSimulation) throw new Error('Missing native batch API');
    api.setMaxTimeStep(1e-9);
    const times: number[] = [], values: number[] = [], started = performance.now();
    const revision = api.getCircuitRevision?.();
    api.ontimestep = () => { times.push(api.getTime()); values.push(resistor.getVoltage(0)); if (times.length === 65536) api.setSimRunning(false); };
    let batches = 0;
    while (times.length < 65536) {
      api.stepSimulation(2048, 8); batches++;
      if (api.getStopMessage()) throw new Error(api.getStopMessage()!);
      if (performance.now() - started > 15000) throw new Error('Native batch capture exceeded 15 seconds');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    api.ontimestep = undefined;
    return { count: times.length, first: times[0], last: times.at(-1)!, elapsed: performance.now() - started, min: Math.min(...values), max: Math.max(...values), batches, unchanged: revision === api.getCircuitRevision?.(), ordered: times.every((time, index) => !index || time > times[index - 1]) };
  });
  expect(result.count).toBe(65536); expect(result.batches).toBeGreaterThan(1);
  expect(result.elapsed).toBeLessThan(15000); expect(result.ordered).toBe(true); expect(result.unchanged).toBe(true);
  expect(result.min).toBeCloseTo(5, 7); expect(result.max).toBeCloseTo(5, 7);
  expect(result.last - result.first).toBeCloseTo(65535e-9, 10);
  console.info(`Native 65,536-sample capture: ${result.elapsed.toFixed(0)} ms in ${result.batches} bounded batches.`);
});

test('outside clicks dismiss inline values and native properties without leaving stale modal state', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  const value = await point(page, 240, 60); await page.mouse.dblclick(value.x, value.y);
  const input = page.getByRole('textbox', { name: 'Resistance (ohms)', exact: true });
  await expect(input).toBeVisible(); await input.fill('2k'); await page.mouse.click(20, 80); await expect(input).toBeHidden();
  await expect.poll(() => output(page)).toBeCloseTo(10 / 3, 5);
  const body = await point(page, 240, 80); await page.mouse.dblclick(body.x, body.y);
  await expect(page.locator('.gwt-DialogBox')).toBeVisible(); await page.mouse.click(20, 80);
  await expect(page.locator('.gwt-DialogBox')).toBeHidden();
  await page.mouse.dblclick(body.x, body.y); await expect(page.locator('.gwt-DialogBox')).toBeVisible();
  await page.evaluate(() => window.CircuitJS1.dismissEditors?.()); await expect(page.locator('.gwt-DialogBox')).toBeHidden();
  await page.mouse.dblclick(value.x, value.y); await expect(input).toBeVisible(); await input.fill('0');
  await page.evaluate(() => window.CircuitJS1.dismissEditors?.()); await expect(input).toBeHidden();
  await expect.poll(() => output(page)).toBeCloseTo(10 / 3, 5);
});

test('changing capture timestep restamps capacitor integration and edit revisions invalidate old records', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const api = window.CircuitJS1;
    api.setSimRunning(false);
    api.importCircuit(`$ 4 0.000005 10.20027730826997 50 5 50 5e-11
v 96 240 96 80 0 0 40 5 0 0 0.5
w 96 80 160 80 0
r 160 80 320 80 0 1000
c 320 80 320 240 0 1e-7 0
w 320 240 96 240 0
g 96 240 96 288 0`, false);
    const capacitor = api.getElements().find((element) => element.getType() === 'CapacitorElm')!;
    api.setMaxTimeStep(1e-7); api.setSimRunning(true);
    let count = 0;
    api.ontimestep = () => { if (++count === 500) api.setSimRunning(false); };
    while (count < 500) api.stepSimulation!(500 - count, 8);
    const midpoint = { voltage: capacitor.getVoltageDiff(), time: api.getTime() };
    api.setMaxTimeStep(2e-7); api.setSimRunning(true);
    api.ontimestep = () => { if (++count === 750) api.setSimRunning(false); };
    while (count < 750) api.stepSimulation!(750 - count, 8);
    api.ontimestep = undefined;
    const final = { voltage: capacitor.getVoltageDiff(), time: api.getTime() };
    const revision = api.getCircuitRevision!();
    api.getElements().find((element) => element.getType() === 'ResistorElm')!.setEditableValue('2k');
    return { midpoint, final, edited: api.getCircuitRevision!() > revision };
  });
  expect(result.midpoint.time).toBeCloseTo(0.00005, 11); expect(result.final.time).toBeCloseTo(0.0001, 11);
  expect(result.midpoint.voltage).toBeCloseTo(5 * (1 - Math.exp(-0.5)), 2);
  expect(result.final.voltage).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
  expect(result.edited).toBe(true);
});

test('starter lead compaction uses real short components and native wires without changing the solution', async ({ page }) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5, 6);
  const initial = await page.evaluate(() => {
    const api = window.CircuitJS1; api.setSimRunning(false);
    const old = api.getElements(), before = old.map((element) => Array.from({length: element.getPostCount()}, (_, index) => element.getVoltage(index)));
    const changed = api.compactComponentLeads!();
    api.setSimRunning(true); api.stepSimulation!(10, 8);
    const now = api.getElements();
    return { changed, added: now.length - old.length, originalObjects: old.every((element, index) => now[index] === element), before,
      after: old.map((element) => Array.from({length: element.getPostCount()}, (_, index) => element.getVoltage(index))),
      lengths: old.filter((element) => ['VoltageElm', 'ResistorElm'].includes(element.getType())).map((element) => Math.hypot(element.getPostX(0)-element.getPostX(1), element.getPostY(0)-element.getPostY(1))),
      wires: now.slice(old.length).every((element) => element.getType() === 'WireElm'),
      serialized: api.exportCircuit(), again: api.compactComponentLeads!(), stop: api.getStopMessage() };
  });
  expect(initial.changed).toBe(3); expect(initial.added).toBe(6); expect(initial.originalObjects).toBe(true);
  expect(initial.lengths).toEqual([64, 64, 64]); expect(initial.wires).toBe(true); expect(initial.again).toBe(0); expect(initial.stop).toBeNull();
  initial.before.forEach((values, index) => values.forEach((value, post) => expect(initial.after[index][post]).toBeCloseTo(value, 8)));
  await page.evaluate((text) => { window.CircuitJS1.importCircuit(text, false); window.CircuitJS1.setSimRunning(true); }, initial.serialized);
  await expect.poll(() => page.evaluate(() => window.CircuitJS1.getElements().filter((element) => element.getType() === 'ResistorElm').map((element) => element.getVoltageDiff()))).toEqual([5,5]);
});

test('native source value edits clear programmed waveform tables and resume the edited waveform', async ({page}) => {
  await open(page); await expect.poll(() => output(page)).toBeCloseTo(5,6);
  const state = await page.evaluate(() => {
    const api = window.CircuitJS1 as AdvancedCircuitJsApi, source = api.getElements()[0];
    const error = api.setSourceWaveform(0,'pwl','0 6 1 6',0);
    api.setMaxTimeStep(1e-6); api.stepSimulation!(8,8);
    const programmed = {xml:source.exportElement(), voltage:source.getVoltage(1)};
    const edited = source.setEditableValue('1000');
    const readings:number[]=[];
    api.ontimestep=()=>readings.push(source.getVoltage(1));
    api.stepSimulation!(128,8); api.ontimestep=undefined;
    return {error, programmed, edited, xml:source.exportElement(), spread:Math.max(...readings)-Math.min(...readings), stop:api.getStopMessage()};
  });
  expect(state.error).toBeNull(); expect(state.programmed.xml).toContain('pwl='); expect(state.programmed.voltage).toBeCloseTo(6,6);
  expect(state.edited).toBeNull(); expect(state.xml).not.toContain('pwl='); expect(state.spread).toBeGreaterThan(0.0001); expect(state.stop).toBeNull();
});
