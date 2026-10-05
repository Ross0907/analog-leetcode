import { expect, test, type Page } from '@playwright/test';

async function openWorkbench(page: Page, path: string) {
  await page.goto(path);
  const workbench = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workbench.locator('p[role="status"]')).toContainText(/Editor ready|Captured/, { timeout: 60000 });
  await expect(workbench.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 60000 });
  return workbench;
}

test('lesson36 has real high-depth spectra for both probes, separate views and linked selection', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const workbench = await openWorkbench(page, '/problems/delta-sigma-output-filter');
  await workbench.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = workbench.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  expect(Number(await spectrum.getByRole('combobox', { name: 'FFT samples', exact: true }).inputValue())).toBeGreaterThanOrEqual(32768);
  await spectrum.getByRole('combobox', { name: 'FFT samples', exact: true }).selectOption('16384');
  await expect(spectrum).toHaveAttribute('data-fft-used', '16384');
  const overlap = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  await expect(overlap.locator('.anacode-scope__channel')).toHaveCount(2);
  await overlap.getByRole('button', { name: 'Select V(bits)', exact: true }).click();
  await expect(workbench.getByRole('button', { name: 'Move probe 1 V(bits)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(overlap.getByRole('button', { name: 'Hide V(bits)', exact: true })).toBeVisible();
  await expect(overlap.getByRole('button', { name: 'Hide V(out)', exact: true })).toBeVisible();
  await overlap.screenshot({ path: 'artifacts/qa/lesson36-fft-16384.png' });
  await spectrum.getByLabel('FFT spectrum trace layout', { exact: true }).selectOption('separate');
  const input = spectrum.getByRole('region', { name: 'FFT spectrum · V(bits)', exact: true });
  const output = spectrum.getByRole('region', { name: 'FFT spectrum · V(out)', exact: true });
  await expect(input).toBeVisible(); await expect(output).toBeVisible();
  expect(Number(await output.getAttribute('data-y-max'))).toBeLessThan(Number(await input.getAttribute('data-y-max')));
  await input.getByRole('button', { name: 'Maximize instrument', exact: true }).click();
  await expect(input).toBeVisible(); await expect(output).toBeHidden();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await input.getByRole('button', { name: 'Restore instrument', exact: true }).click();
  await expect(output).toBeVisible();
  await workbench.getByRole('button', { name: 'Move probe 2 V(out)', exact: true }).click();
  await expect(output.getByRole('button', { name: 'Select V(out)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await workbench.getByRole('button', { name: 'Oscilloscope', exact: true }).click();
  await workbench.getByLabel('Oscilloscope trace layout', { exact: true }).selectOption('separate');
  await expect(workbench.getByRole('region', { name: 'Oscilloscope · V(bits)', exact: true })).toBeVisible();
  await expect(workbench.getByRole('region', { name: 'Oscilloscope · V(out)', exact: true }).getByRole('button', { name: 'Select V(out)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await workbench.getByRole('button', { name: 'Logic analyzer', exact: true }).click();
  const logic = workbench.getByRole('region', { name: 'Logic analyzer', exact: true });
  await logic.getByRole('button', { name: 'Select V(bits)', exact: true }).click();
  await expect(workbench.getByRole('button', { name: 'Move probe 1 V(bits)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await logic.getByLabel('Logic analyzer trace layout', { exact: true }).selectOption('overlap');
  await expect(logic.getByRole('img', { name: 'Overlapping digital waveforms', exact: true }).locator('path')).toHaveCount(2);
  await workbench.getByRole('button', { name: 'DC readings', exact: true }).click();
  const readings = workbench.getByRole('region', { name: 'DC readings', exact: true });
  await readings.getByRole('button', { name: 'Select V(out)', exact: true }).click();
  await expect(workbench.getByRole('button', { name: 'Move probe 2 V(out)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('an unsupported FFT depth retains measured spectra and requests a denser run of the same solver', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const workbench = await openWorkbench(page, '/lab');
  await workbench.getByLabel('Capture target samples', { exact: true }).selectOption('1024');
  await workbench.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(workbench.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await workbench.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = workbench.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  await spectrum.getByRole('combobox', { name: 'FFT samples', exact: true }).selectOption('16384');
  await expect(spectrum).toHaveAttribute('data-fft-used', '1024');
  await expect(spectrum.getByRole('region', { name: 'FFT spectrum', exact: true })).toBeVisible();
  await expect(spectrum.getByRole('status').filter({ hasText: 'Requested 16,384 FFT samples' })).toContainText('showing 1,024 supported samples');
  await spectrum.getByRole('button', { name: 'Capture more samples for 16,384-point FFT', exact: true }).click();
  await expect(spectrum).toHaveAttribute('data-fft-used', '16384', { timeout: 60000 });
  await expect(spectrum.getByRole('combobox', { name: 'FFT samples', exact: true })).toHaveValue('16384');
  await expect(workbench.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(workbench.getByRole('button', { name: 'Spectrum', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(spectrum.getByRole('region', { name: 'FFT spectrum', exact: true }).locator('.anacode-scope__channel')).toHaveCount(2);
  expect(errors).toEqual([]);
});
