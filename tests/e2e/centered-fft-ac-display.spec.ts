import { expect, test } from '@playwright/test';

test('AC lessons open a separate AC display and retain explicit time capture', async ({ page }) => {
  await page.goto('/problems/sallen-key-q');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  const run = work.getByRole('button', { name: 'Run AC sweep', exact: true });
  await expect(run).toBeEnabled({ timeout: 60000 });
  await expect(work.getByRole('button', { name: 'AC sweep', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(work.getByRole('region', { name: 'Oscilloscope', exact: true })).toHaveCount(0);
  await run.click();
  await expect(work.getByRole('region', { name: 'AC sweep analyzer', exact: true })).toBeVisible({ timeout: 60000 });
  await expect(work.getByRole('region', { name: 'Bode magnitude', exact: true })).toBeVisible();
  await expect(work.getByRole('region', { name: 'Bode phase', exact: true })).toBeVisible();
  await work.getByRole('button', { name: 'Circuit probes', exact: true }).click();
  await work.getByRole('button', { name: 'Capture all probes', exact: true }).click();
  await expect(work.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible({ timeout: 60000 });
  await work.getByRole('button', { name: 'AC sweep', exact: true }).click();
  await expect(work.getByRole('region', { name: 'AC sweep analyzer', exact: true })).toBeVisible();
});

test('lesson29 centers its measured FFT and frequency cursors move precisely while zoomed', async ({ page }) => {
  await page.goto('/problems/adc-acquisition-settling');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', { name: 'Spectrum', exact: true })).toBeVisible({ timeout: 60000 });
  await work.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = work.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  await spectrum.getByRole('combobox', { name: 'Channel', exact: true }).selectOption({ label: 'V(out)' });
  await expect(spectrum.getByLabel('Spectrum frequency range', { exact: true })).toHaveValue('peak');
  const plot = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  const low = Number(await plot.getAttribute('data-x-min')), high = Number(await plot.getAttribute('data-x-max'));
  expect(low).toBeGreaterThanOrEqual(0); expect(high).toBeGreaterThan(low);
  const cursor = plot.getByRole('textbox', { name: 'Cursor A position', exact: true });
  await expect(cursor).toBeVisible();
  const target = low + .123456789 * (high - low);
  await cursor.fill(String(target)); await cursor.press('Enter');
  expect(Number(await cursor.inputValue())).toBeCloseTo(target, 4);
  await plot.locator('.anacode-scope__details > summary').click();
  await plot.getByRole('button', { name: 'Zoom in waveform', exact: true }).click();
  await cursor.fill(String(low + .95 * (high - low))); await cursor.press('Enter');
  expect(Number(await cursor.inputValue())).toBeCloseTo(low + .95 * (high - low), 4);
  await expect(cursor).toHaveAttribute('aria-invalid', 'false');
  await spectrum.getByLabel('Spectrum frequency range', { exact: true }).selectOption('full');
  expect(Number(await plot.getAttribute('data-x-max'))).toBeGreaterThan(high);
});
