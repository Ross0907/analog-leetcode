import { expect, test, type Page } from '@playwright/test';
import type { AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';

type NativeWindow = Window & { CircuitJS1: AdvancedCircuitJsApi; AnaCodeKiCad?: { ready: boolean } };
const fixture = '$ 4 .000001 10 50 5 50\nv 96 240 96 80 0 0 40 10 0 0 .5\nw 96 80 320 80 0\nr 320 80 320 240 0 1000\nw 320 240 96 240 0\ng 96 240 96 288 0';
async function open(page: Page) {
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 .000001 10 50 5 50')}`);
  await page.waitForFunction(() => Boolean((window as unknown as NativeWindow).CircuitJS1?.ensureAnalyzed && (window as unknown as NativeWindow).AnaCodeKiCad?.ready));
  await page.evaluate(text => {
    const api = (window as unknown as NativeWindow).CircuitJS1;
    api.importCircuit(text, false); api.setTheme('dark');
    api.setSourceWaveform(0, 'pwl', '0 0 .001 2 .002 0', .002); api.ensureAnalyzed!();
  }, fixture);
  await showProperties(page);
}
async function showProperties(page: Page) {
  const body = await page.evaluate(() => { const a = (window as unknown as NativeWindow).CircuitJS1, r = document.querySelector('canvas')!.getBoundingClientRect(); return { x: r.left + a.screenX(96), y: r.top + a.screenY(160) }; });
  await page.mouse.dblclick(body.x, body.y);
  await expect(page.locator('.anacode-pwl-editor')).toBeVisible();
}
const xml = (page: Page) => page.evaluate(() => (window as unknown as NativeWindow).CircuitJS1.getElements()[0].exportElement());

test('native PWL properties edit real points with a preview, validation, repeat and saved/undo state', async ({ page }) => {
  await open(page);
  const dialog = page.locator('.gwt-DialogBox');
  await expect(dialog.getByText('Frequency (Hz)', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('PWL waveform preview')).toBeVisible();
  const original = await xml(page);
  const previewBefore = await dialog.getByLabel('PWL waveform preview').evaluate(c => (c as HTMLCanvasElement).toDataURL());
  await dialog.getByLabel('PWL voltage 2', { exact: true }).fill('4');
  await dialog.getByLabel('PWL voltage 2', { exact: true }).press('Tab');
  await expect.poll(() => dialog.getByLabel('PWL waveform preview').evaluate(c => (c as HTMLCanvasElement).toDataURL())).not.toBe(previewBefore);
  expect(await xml(page)).toBe(original);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await xml(page)).toBe(original);
  await showProperties(page);
  await dialog.getByLabel('PWL time 2', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await xml(page)).toBe(original);
  await expect(dialog.locator('.pwl-error')).toContainText('increasing times');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).toBeVisible(); expect(await xml(page)).toBe(original);
  await dialog.getByLabel('PWL time 2', { exact: true }).fill('1m');
  await dialog.getByLabel('PWL voltage 2', { exact: true }).fill('4');
  await dialog.getByLabel('PWL repeat period', { exact: true }).fill('2m');
  await dialog.getByRole('button', { name: 'Add point', exact: true }).click();
  await expect(dialog.getByLabel('PWL time 4', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove PWL point 4', exact: true }).click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  const updated = await xml(page);
  expect(updated).toContain('pwl="0 0 0.001 4 0.002 0"'); expect(updated).toContain('pwlr="0.002"');
  const readings = await page.evaluate(() => {
    const a = (window as unknown as NativeWindow).CircuitJS1, source = a.getElements()[0], values: { t: number; v: number }[] = [];
    a.resetSimulation!(); a.setMaxTimeStep(.000001); a.setSimRunning(true);
    a.ontimestep = () => { values.push({ t: a.getTime(), v: source.getVoltage(1) }); if (values.length === 2500) a.setSimRunning(false); };
    while (values.length < 2500) a.stepSimulation!(2500 - values.length, 8);
    a.ontimestep = undefined; return values;
  });
  for (const index of [499, 999, 1499, 2499]) {
    const sample = readings[index], phase = sample.t % .002;
    expect(sample.v).toBeCloseTo(phase <= .001 ? phase * 4000 : (.002 - phase) * 4000, 2);
  }
  await page.keyboard.press('Control+z'); expect(await xml(page)).toBe(original);
  await page.keyboard.press('Control+y'); expect(await xml(page)).toBe(updated);
  const saved = await page.evaluate(() => (window as unknown as NativeWindow).CircuitJS1.exportCircuit());
  await page.evaluate(text => (window as unknown as NativeWindow).CircuitJS1.importCircuit(text, false), saved);
  expect(await xml(page)).toBe(updated);
  await showProperties(page);
  const sides = await dialog.locator('.dialogMiddleLeft, .dialogMiddleRight').evaluateAll(nodes => nodes.map(n => ({ color: getComputedStyle(n).backgroundColor, image: getComputedStyle(n).backgroundImage })));
  expect(sides.length).toBe(2); expect(sides.every(s => s.image === 'none' && s.color !== 'rgb(255, 255, 255)')).toBe(true);
  await page.screenshot({ path: '.tmp/native-pwl-properties-dark.png' });
});

test('PWL sources switch explicitly back to standard waveform properties', async ({ page }) => {
  await open(page);
  const dialog = page.locator('.gwt-DialogBox');
  await dialog.getByRole('button', { name: 'Use standard waveform settings', exact: true }).click();
  await expect(dialog.getByText('Frequency (Hz)', { exact: true })).toBeVisible();
  expect(await xml(page)).not.toContain('pwl=');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await page.keyboard.press('Control+z'); expect(await xml(page)).toContain('pwl=');
});
