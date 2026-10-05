import { expect, test } from '@playwright/test';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import type { CircuitJsApi } from '../../lib/circuitjs';

test('blank schematic deselects probes and top sweep controls replace the transient result', async ({ page }) => {
  await page.goto('/lab');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45000 });
  const grip = work.getByRole('button', { name: 'Move probe 1 V(vin)', exact: true });
  await grip.click(); await expect(grip).toHaveAttribute('aria-pressed', 'true');
  const canvas = page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('canvas').first();
  const size = await canvas.boundingBox();
  await canvas.click({ position: { x: size!.width - 20, y: size!.height - 20 } });
  await expect(grip).toHaveAttribute('aria-pressed', 'false');
  await expect(work.getByRole('button', { name: 'Select V(vin)', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const capacitor = await canvas.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    const element = api.getElements().find(element => element.getType() === 'CapacitorElm')!;
    return { x: api.screenX((element.getPostX(0) + element.getPostX(1)) / 2), y: api.screenY((element.getPostY(0) + element.getPostY(1)) / 2) };
  });
  await canvas.dblclick({ position: capacitor });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  await expect(native.locator('.gwt-DialogBox')).toBeVisible();
  await expect(work.getByRole('img', { name: 'Schematic probes' })).toBeHidden();
  await native.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(work.getByRole('img', { name: 'Schematic probes' })).toBeVisible();
  await work.locator('input[type="file"]').setInputFiles({ name: 'divider.circuitjs.txt', mimeType: 'text/plain', buffer: Buffer.from(CIRCUITJS_STARTERS['precision-voltage-divider']) });
  await work.getByRole('button', { name: 'Capture all probes', exact: true }).click();
  await expect(work.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible();
  await work.getByRole('button', { name: 'Spectrum', exact: true }).click();
  await expect(work.getByRole('region', { name: 'Spectrum analyzer', exact: true })).toBeVisible();
  await work.locator('.analysis-controls > summary').click();
  await work.getByLabel('SPICE analysis source', { exact: true }).selectOption('deck');
  await work.getByLabel('Schematic analysis type', { exact: true }).selectOption('ac-sweep');
  await expect(work.getByRole('region', { name: 'Spectrum analyzer', exact: true })).toHaveCount(0);
  await expect(work.getByText('Run the AC sweep above. Bode magnitude and phase will appear here.', { exact: true })).toBeVisible();
  await work.getByRole('button', { name: 'Run AC sweep', exact: true }).click();
  await expect(work.getByLabel('SPICE analysis source', { exact: true })).toHaveValue('schematic');
  const magnitude = work.getByRole('region', { name: 'Bode magnitude', exact: true });
  await expect(magnitude).toBeVisible({ timeout: 45000 });
  await expect(work.getByRole('region', { name: 'Bode phase', exact: true })).toBeVisible();
  await expect(work.getByRole('heading', { name: 'AC frequency response', exact: true })).toBeVisible();
  expect((await magnitude.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height - 100);
  await work.getByLabel('Schematic analysis type', { exact: true }).selectOption('dc-sweep');
  await expect(magnitude).toHaveCount(0);
  await work.getByRole('button', { name: 'Run DC sweep', exact: true }).click();
  await expect(work.getByRole('region', { name: 'Curve tracer', exact: true })).toBeVisible({ timeout: 45000 });
  await expect(work.getByRole('heading', { name: 'DC transfer curve', exact: true })).toBeVisible();
});

test('the inverter starts with visible input and output probes', async ({ page }) => {
  await page.goto('/problems/cmos-inverter-trip-point');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45000 });
  await expect(work.getByRole('button', { name: /Move probe \d+ V\(in\)/ })).toBeVisible();
  await expect(work.getByRole('button', { name: /Move probe \d+ V\(out\)/ })).toBeVisible();
  await expect(work.getByRole('button', { name: 'Hide V(in)', exact: true })).toBeVisible();
  await expect(work.getByRole('button', { name: 'Hide V(out)', exact: true })).toBeVisible();
});
