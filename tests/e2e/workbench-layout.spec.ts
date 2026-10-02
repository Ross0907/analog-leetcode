import { expect, test } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

test('compact description, schematic width/height and probe drawer remain adjustable', async ({ page }) => {
  await page.goto('/problems/precision-voltage-divider');
  await expect(page.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Compact description', exact: true }).click();
  const description = page.locator('#problem-description-pane');
  const before = (await description.boundingBox())!.width;
  const problemDivider = page.getByRole('separator', { name: 'Resize problem and schematic panes' });
  await problemDivider.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await description.boundingBox())!.width).toBeGreaterThan(before + 5);
  const frame = page.locator('iframe[title="CircuitJS schematic editor"]');
  const editorBefore = (await frame.boundingBox())!;
  const split = page.getByRole('separator', { name: 'Resize schematic and instruments', exact: true });
  await split.focus(); await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThan(editorBefore.width - 5);
  const height = page.getByRole('separator', { name: 'Resize schematic height', exact: true });
  await height.focus(); await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(editorBefore.height + 10);
  await page.locator('summary').filter({ hasText: 'Probes & capture settings' }).click();
  const probeDivider = page.getByRole('separator', { name: 'Resize probe settings' });
  await probeDivider.focus(); await page.keyboard.press('ArrowDown');
  await expect(probeDivider).toHaveAttribute('aria-valuenow', '230');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled();
  await expect(height).toHaveAttribute('aria-valuenow', '670');
});

test('capture stays beside the schematic and probe artwork stays compact through native zoom', async ({ page }) => {
  await page.goto('/problems/rc-cutoff-1khz');
  await expect(page.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled();
  const editor = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  const frame = page.frames().find(frame => frame.url().includes('/circuitjs/circuitjs.html'))!;
  const overlay = page.getByRole('button', { name: /^Move probe 1 / });
  const scale = () => overlay.getAttribute('transform').then(value => Number(value?.match(/scale\(([^)]+)\)/)?.[1]));
  await expect.poll(scale).toBeGreaterThan(0);
  const originalScale = await scale();
  await frame.evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.zoomCircuit(1));
  await expect.poll(scale).toBeGreaterThanOrEqual(originalScale);
  expect(await scale()).toBeLessThanOrEqual(1);
  const start = Date.now();
  await page.getByRole('button', { name: 'Capture all probes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Captured' })).toBeVisible({ timeout: 15000 });
  expect(Date.now() - start).toBeLessThan(15000);
  const waveform = page.getByRole('region', { name: 'Oscilloscope', exact: true });
  await expect(waveform).toBeVisible();
  const drawingBounds = (await page.locator('iframe[title="CircuitJS schematic editor"]').boundingBox())!;
  const waveBounds = (await waveform.boundingBox())!;
  expect(waveBounds.x).toBeGreaterThan(drawingBounds.x + drawingBounds.width);
  expect(waveBounds.y).toBeLessThan(drawingBounds.y + 150);
  await expect(editor.locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: '.tmp/refined-workbench-light.png', fullPage: false });
});

test('schematic-only light mode leaves the dark instrument theme unchanged', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled();
  const toDark = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  if (await toDark.count()) await toDark.click();
  await page.getByRole('combobox', { name: 'Schematic theme', exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  await expect(native.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Capture all probes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Oscilloscope', exact: true })).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: '.tmp/refined-workbench-paper-dark.png', fullPage: false });
});
