import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openDisclosure(workspace: Locator, title: string) {
  const summary = workspace.locator('details > summary').filter({ hasText: title });
  if (await summary.locator('..').getAttribute('open') === null) await summary.click();
}

async function measuredLab(page: Page) {
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText(/Editor ready|Captured/, { timeout: 45_000 });
  await expect(workspace.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45_000 });
  await openDisclosure(workspace, 'Probes & capture settings');
  await workspace.getByLabel('Capture target samples', { exact: true }).selectOption('1024');
  await workspace.getByLabel('Capture duration in seconds', { exact: true }).fill('0.01');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 45_000 });
  await expect(workspace.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible({ timeout: 45_000 });
  return workspace;
}

async function expectPngDownload(page: Page, instrument: Locator, filename: string) {
  const pending = page.waitForEvent('download');
  await instrument.getByRole('button', { name: 'Save instrument PNG', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  await download.saveAs(test.info().outputPath(filename));
  const bytes = await readFile((await download.path())!);
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(header.getUint32(16)).toBeGreaterThan(250);
  expect(header.getUint32(20)).toBeGreaterThan(100);
  expect(await download.failure()).toBeNull();
}

test('display offsets preserve actual measurements, Auto set fits and maximize stays inside the workbench', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const workspace = await measuredLab(page);
  const scope = workspace.getByRole('region', { name: 'Oscilloscope', exact: true });
  await scope.locator('.anacode-scope__details > summary').click();
  const measurements = await scope.locator('tbody').innerText();
  await scope.getByRole('button', { name: 'Hide V(vin)', exact: true }).click({ button: 'right' });
  const menu = page.getByRole('dialog', { name: 'Trace style: V(vin)', exact: true });
  await menu.getByLabel('Trace display offset', { exact: true }).fill('2');
  await page.keyboard.press('Escape');
  await expect(scope).toHaveAttribute('data-display-offsets', 'true');
  await expect.poll(() => scope.locator('tbody').innerText()).toBe(measurements);
  await scope.getByRole('button', { name: 'Stack traces', exact: true }).click();
  await expect.poll(() => scope.locator('tbody').innerText()).toBe(measurements);
  await scope.getByRole('button', { name: 'Clear offsets', exact: true }).click();
  await expect(scope).toHaveAttribute('data-display-offsets', 'false');
  await scope.getByRole('button', { name: 'Zoom in waveform', exact: true }).click();
  await expect(scope.getByRole('combobox', { name: 'Time/div', exact: true })).not.toHaveValue('auto');
  await scope.getByRole('button', { name: 'Auto set', exact: true }).click();
  await expect(scope.getByRole('combobox', { name: 'Time/div', exact: true })).toHaveValue('auto');
  await scope.getByLabel('Time window', { exact: true }).selectOption('requested');
  expect(Number(await scope.getAttribute('data-x-min'))).toBe(0);
  expect(Number(await scope.getAttribute('data-x-max'))).toBeCloseTo(0.01, 6);
  const widthBefore = (await scope.locator('canvas').boundingBox())!.width;
  await scope.getByRole('button', { name: 'Maximize instrument', exact: true }).click();
  await expect(scope).toHaveAttribute('data-instrument-maximized', 'true');
  await expect.poll(async () => (await scope.locator('canvas').boundingBox())!.width).toBeGreaterThan(widthBefore * 1.2);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expectPngDownload(page, scope, 'oscilloscope.png');
  await scope.getByRole('button', { name: 'Restore instrument', exact: true }).click();
  await expect(scope).toHaveAttribute('data-instrument-maximized', 'false');
  await expect.poll(async () => Math.abs((await scope.locator('canvas').boundingBox())!.width - widthBefore)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('FFT, logic and DC readouts provide working Auto set and instrument PNG exports', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const workspace = await measuredLab(page);
  await workspace.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = workspace.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  await spectrum.getByRole('spinbutton', { name: 'Start / Hz', exact: true }).fill('1000000000');
  await expect(spectrum.getByText('Select a frequency span containing at least two bins.')).toBeVisible();
  await spectrum.getByRole('button', { name: 'Auto set', exact: true }).click();
  await expect(spectrum.getByRole('region', { name: 'FFT spectrum', exact: true })).toBeVisible();
  await expect(spectrum.getByRole('spinbutton', { name: 'Start / Hz', exact: true })).toHaveValue('0');
  await expectPngDownload(page, spectrum.getByRole('region', { name: 'FFT spectrum', exact: true }), 'fft-spectrum.png');
  await workspace.getByRole('button', { name: 'Logic analyzer', exact: true }).click();
  const logic = workspace.getByRole('region', { name: 'Logic analyzer', exact: true });
  await logic.getByLabel('Low ≤ V', { exact: true }).fill('10');
  await logic.getByLabel('High ≥ V', { exact: true }).fill('1');
  await expect(logic.getByRole('alert')).toBeVisible();
  await logic.getByRole('button', { name: 'Auto set', exact: true }).click();
  await expect(logic.getByRole('alert')).toHaveCount(0);
  expect(Number(await logic.getByLabel('High ≥ V', { exact: true }).inputValue())).toBeGreaterThan(Number(await logic.getByLabel('Low ≤ V', { exact: true }).inputValue()));
  await expectPngDownload(page, logic, 'logic-analyzer.png');
  await workspace.getByRole('button', { name: 'DC readings', exact: true }).click();
  const readout = workspace.getByRole('region', { name: 'DC readings', exact: true });
  await expect(readout.getByText('Latest captured sample', { exact: false })).toBeVisible();
  await readout.getByLabel('DC readout units', { exact: true }).selectOption('base');
  await readout.getByRole('button', { name: 'Auto set', exact: true }).click();
  await expect(readout.getByLabel('DC readout units', { exact: true })).toHaveValue('engineering');
  await expectPngDownload(page, readout, 'dc-readings.png');
  expect(errors).toEqual([]);
});
