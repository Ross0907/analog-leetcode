import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import { parseEngineeringNumber } from '../../lib/engineering';

async function openLab(page: Page) {
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText('Editor ready', { timeout: 45_000 });
  return workspace;
}

async function openDisclosure(workspace: Locator, title: string) {
  const summary = workspace.locator('details > summary').filter({ hasText: title });
  if (await summary.locator('..').getAttribute('open') === null) await summary.click();
}

async function expectMeasuredResult(workspace: Locator, minimumPoints: number) {
  const footer = workspace.locator('.result-footer');
  await expect(footer).toBeVisible({ timeout: 45_000 });
  const count = Number((await footer.locator('span').filter({ hasText: /points$/ }).innerText()).replace(/[^0-9]/g, ''));
  expect(count, 'The displayed solver result must retain the requested record depth').toBeGreaterThanOrEqual(minimumPoints);
  await expect(workspace.getByText('Simulation stopped', { exact: true })).toHaveCount(0);
}

function voltage(text: string) {
  return parseEngineeringNumber(text.replace(/\s+/g, '').replace(/V$/, '').replace('µ', 'u'));
}

test('default 65536-point SPICE capture follows native PWL and bitstream source controls', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const workspace = await openLab(page);
  await openDisclosure(workspace, 'Probes & capture settings');
  await expect(workspace.getByLabel('Capture target samples', { exact: true })).toHaveValue('65536');
  await expect(workspace.getByLabel('Capture duration in seconds', { exact: true })).toHaveValue('0.01');
  await expect(workspace.getByLabel('Probe 1 name', { exact: true })).toHaveValue('V(vin)');
  await expect(workspace.getByLabel('Probe 2 name', { exact: true })).toHaveValue('V(vout)');
  await openDisclosure(workspace, 'Analysis, sources & models');
  await expect(workspace.getByLabel('SPICE analysis source', { exact: true })).toHaveValue('schematic');
  await expect(workspace.getByLabel('Schematic analysis type', { exact: true })).toHaveValue('transient');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expectMeasuredResult(workspace, 65536);
  const scope = workspace.getByRole('region', { name: 'Oscilloscope', exact: true });
  await expect(scope).toBeVisible();
  await expect(scope.getByRole('button', { name: 'Hide V(vin)', exact: true })).toBeVisible();
  await expect(scope.getByRole('button', { name: 'Hide V(vout)', exact: true })).toBeVisible();
  await expect(workspace.getByLabel('Probe vectors', { exact: true })).toHaveValue('V(vin), V(vout)');
  expect(Number(await scope.getAttribute('data-x-max'))).toBeCloseTo(0.01, 6);

  await workspace.getByLabel('Source waveform type', { exact: true }).selectOption('pwl');
  await workspace.getByLabel('PWL source points', { exact: true }).fill('0, 0\n1m, 0\n1.1m, 3.3\n3m, 3.3\n3.1m, 0\n10m, 0');
  const sourceIndex = Number(await workspace.getByLabel('Waveform source', { exact: true }).inputValue());
  await workspace.getByRole('button', { name: 'Apply waveform', exact: true }).click();
  await expect(scope, 'An applied source edit must clear the old waveform').toHaveCount(0);
  await expect(workspace.locator('.result-footer')).toHaveCount(0);
  const sourceExport = () => page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('body').evaluate((_, index) => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements()[index].exportElement(), sourceIndex);
  await expect.poll(sourceExport).toContain('pwl=');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expectMeasuredResult(workspace, 65536);
  await expect(scope).toBeVisible();
  await scope.locator('.anacode-scope__details > summary').click();
  const sourceMeasurements = scope.getByRole('rowheader', { name: 'V(vin) DC', exact: true }).locator('..');
  const maximumColumn = (await scope.getByRole('columnheader').allTextContents()).indexOf('Max') - 1;
  expect(maximumColumn).toBeGreaterThanOrEqual(0);
  const maximumVolts = voltage(await sourceMeasurements.locator('td').nth(maximumColumn).innerText());
  expect(maximumVolts).not.toBeNull();
  expect(maximumVolts!).toBeCloseTo(3.3, 3);

  await workspace.getByLabel('Source waveform type', { exact: true }).selectOption('bitstream');
  await workspace.getByLabel('Binary sequence', { exact: true }).fill('1010');
  await workspace.getByLabel('Bit period (s)', { exact: true }).fill('1m');
  await workspace.getByLabel('Rise/fall time (s)', { exact: true }).fill('1u');
  await workspace.getByLabel('Low level', { exact: true }).fill('0');
  await workspace.getByLabel('High level', { exact: true }).fill('3.3');
  await workspace.getByRole('checkbox', { name: 'Repeat sequence', exact: true }).check();
  await workspace.getByRole('button', { name: 'Apply waveform', exact: true }).click();
  await expect(scope).toHaveCount(0);
  await expect(workspace.locator('.result-footer')).toHaveCount(0);
  await expect.poll(sourceExport).toContain('pwl=');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expectMeasuredResult(workspace, 65536);
  const logic = workspace.getByRole('region', { name: 'Logic analyzer', exact: true });
  await expect(logic, 'Bitstream analysis should choose the logic view without a manual view change').toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Logic analyzer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const inputTrace = logic.getByRole('img', { name: 'V(vin) digital waveform', exact: true }).locator('path');
  await expect(inputTrace).toHaveAttribute('d', /V9/);
  await expect(inputTrace).toHaveAttribute('d', /V37/);
  expect(errors).toEqual([]);
});

test('AC analysis uses the displayed default excitation without changing its dropdown', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const workspace = await openLab(page);
  await workspace.locator('input[type="file"]').setInputFiles({
    name: 'divider.circuitjs.txt', mimeType: 'text/plain', buffer: Buffer.from(CIRCUITJS_STARTERS['precision-voltage-divider']),
  });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  await expect.poll(() => native.locator('body').evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().filter(element => element.getType() === 'ResistorElm').length)).toBe(2);
  await openDisclosure(workspace, 'Analysis, sources & models');
  await workspace.getByLabel('Schematic analysis type', { exact: true }).selectOption('ac-sweep');
  const excitation = workspace.getByLabel('AC excitation source', { exact: true });
  const displayedDefault = await excitation.locator('option').first().getAttribute('value');
  expect(displayedDefault).not.toBeNull();
  await expect(excitation).toHaveValue(displayedDefault!);
  // Deliberately never dispatch a change event to the excitation selector.
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expectMeasuredResult(workspace, 2);
  const magnitude = workspace.getByRole('region', { name: 'Bode magnitude', exact: true });
  await expect(magnitude).toBeVisible();
  await expect(workspace.getByRole('region', { name: 'Bode phase', exact: true })).toBeVisible();
  for (const attribute of ['data-x-min', 'data-x-max', 'data-y-min', 'data-y-max']) expect(Number.isFinite(Number(await magnitude.getAttribute(attribute)))).toBe(true);
  await magnitude.locator('.anacode-scope__details > summary').click();
  const outputMeasurements = magnitude.getByRole('rowheader', { name: 'V(vout)', exact: true }).locator('..');
  const minimumColumn = (await magnitude.getByRole('columnheader').allTextContents()).indexOf('Min') - 1;
  expect(minimumColumn).toBeGreaterThanOrEqual(0);
  const gain = Number.parseFloat(await outputMeasurements.locator('td').nth(minimumColumn).innerText());
  expect(gain, 'A 1:1 divider with unit AC excitation must measure 20 log10(0.5) dB').toBeCloseTo(20 * Math.log10(0.5), 2);
  expect(errors).toEqual([]);
});
