import { test, expect, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

declare global { interface Window { CircuitJS1: CircuitJsApi; AnaCodeKiCad?: { ready: boolean } } }

const divider = `$ 4 0.000005 10.20027730826997 50 5 50 5e-11
v 96 240 96 80 0 0 40 10 0 0 0.5
w 96 80 160 80 0
r 160 80 320 80 0 1000
r 320 80 320 240 0 1000
w 320 240 96 240 0
g 96 240 96 288 0`;

async function open(page: Page, text = divider) {
  page.on('pageerror', (error) => console.error('Native runtime:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Native asset:', message.text()); });
  await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true');
  await expect.poll(() => page.evaluate(() => typeof window.CircuitJS1?.setTheme === 'function' && window.AnaCodeKiCad?.ready === true)).toBe(true);
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
  const value = await point(page, 240, 60); await page.mouse.click(value.x, value.y);
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
  const value = await point(page, 240, 60); await page.mouse.click(value.x, value.y);
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
