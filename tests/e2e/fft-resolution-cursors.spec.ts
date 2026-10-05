import { expect, test, type Page } from '@playwright/test';

async function lesson(page: Page) {
  await page.goto('/problems/rc-high-pass');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 60000 });
  await work.getByRole('button', { name: 'Circuit probes', exact: true }).click();
  await work.getByRole('button', { name: 'Capture all probes', exact: true }).click();
  await expect(work.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible({ timeout: 60000 });
  return work;
}

for (const engine of ['native', 'ngspice']) test(`${engine} longer settled FFT uses measured time and sharper physical resolution`, async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const work = await lesson(page);
  if (engine === 'ngspice') {
    await work.getByLabel('Schematic analysis type', { exact: true }).selectOption('transient');
    await work.getByRole('button', { name: 'Run transient analysis', exact: true }).click();
    await expect(work.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  }
  await work.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = work.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  const originalSpacing = Number(await spectrum.getAttribute('data-bin-width'));
  expect(originalSpacing).toBeGreaterThan(190);
  await spectrum.locator('summary').filter({ hasText: 'Finer resolution & settled capture' }).click();
  await spectrum.getByLabel('FFT capture record length', { exact: true }).fill('.04');
  await spectrum.getByLabel('FFT capture settling time', { exact: true }).fill('.005');
  await spectrum.getByRole('button', { name: 'Capture longer FFT record', exact: true }).click();
  await expect(spectrum).toHaveAttribute('data-fft-used', '65536', { timeout: 60000 });
  expect(Number(await spectrum.getAttribute('data-bin-width'))).toBeCloseTo(25, 1);
  expect(Number(await spectrum.getAttribute('data-record-start'))).toBeGreaterThanOrEqual(.005 - 1e-7);
  expect(Number(await spectrum.getAttribute('data-record-end'))).toBeCloseTo(.045, 4);
  await spectrum.getByRole('combobox', { name: 'Channel', exact: true }).selectOption({ label: 'V(out)' });
  await spectrum.getByLabel('Spectrum frequency range', { exact: true }).selectOption('peak');
  const plot = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  const low = Number(await plot.getAttribute('data-x-min')), high = Number(await plot.getAttribute('data-x-max'));
  expect((low + high) / 2).toBeCloseTo(1000, -1);
  await spectrum.getByRole('spinbutton', { name: 'Marker / Hz', exact: true }).fill('1000');
  await expect(spectrum.getByText(/^Marker:/)).toContainText(/-5\.48\d? dB/);
  await spectrum.getByRole('combobox', { name: 'Window', exact: true }).selectOption('rectangular');
  await expect(spectrum.getByText(/^Marker:/)).toContainText(/-5\.48\d? dB/);
  await plot.screenshot({ path: `artifacts/qa/lesson15-${engine}-long-settled-fft.png` });
  await spectrum.getByLabel('Spectrum frequency range', { exact: true }).selectOption('full');
  expect(Number(await plot.getAttribute('data-x-min'))).toBe(0);
  expect(Number(await plot.getAttribute('data-x-max'))).toBeGreaterThan(800000);
  await expect(spectrum.getByText(/^Marker:/)).toContainText(/-5\.48\d? dB/);
  if (engine === 'ngspice') {
    await expect(work.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (!await spectrum.getByLabel('FFT capture record length', { exact: true }).isVisible()) await spectrum.locator('summary').filter({ hasText: 'Finer resolution & settled capture' }).click();
    await spectrum.getByLabel('FFT capture record length', { exact: true }).fill('.08');
    await spectrum.getByLabel('FFT capture settling time', { exact: true }).fill('.005');
    await spectrum.getByRole('button', { name: 'Capture longer FFT record', exact: true }).click();
    await expect(spectrum).toHaveAttribute('data-fft-used', '131072', { timeout: 60000 });
    expect(Number(await spectrum.getAttribute('data-bin-width'))).toBeCloseTo(12.5, 1);
    expect(Number(await spectrum.getAttribute('data-record-start'))).toBeGreaterThanOrEqual(.005 - 1e-7);
    expect(Number(await spectrum.getAttribute('data-record-end'))).toBeCloseTo(.085, 4);
    await spectrum.getByRole('combobox', { name: 'Channel', exact: true }).selectOption({ label: 'V(out)' });
    await spectrum.getByRole('spinbutton', { name: 'Marker / Hz', exact: true }).fill('1000');
    await expect(spectrum.getByText(/^Marker:/)).toContainText(/-5\.48\d? dB/);
    await expect(work.getByRole('button', { name: 'SPICE response', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(errors).toEqual([]);
});

test('precise time, amplitude and logarithmic frequency cursors accept numeric entry without slider quantization', async ({ page }) => {
  const work = await lesson(page), scope = work.getByRole('region', { name: 'Oscilloscope', exact: true });
  await scope.locator('.anacode-scope__details > summary').click();
  for (const [label, value, expected] of [['Cursor A position', '1.234567m', .001234567], ['Cursor B position', '3.456789e-3', .003456789], ['Amplitude cursor A position', '-.123456789', -.123456789], ['Amplitude cursor B position', '.345678912', .345678912]] as const) {
    const input = scope.getByRole('textbox', { name: label, exact: true }); await input.fill(value); await input.press('Enter');
    expect(Number(await input.inputValue())).toBeCloseTo(expected, 11);
  }
  const cursor = scope.getByRole('textbox', { name: 'Cursor A position', exact: true });
  await cursor.fill('10'); await cursor.press('Enter'); await expect(cursor).toHaveAttribute('aria-invalid', 'true');
  await expect(scope.getByRole('alert')).toContainText('zoom out');
  await cursor.press('Escape'); expect(Number(await cursor.inputValue())).toBeCloseTo(.001234567, 11);
  await work.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = work.getByRole('region', { name: 'Spectrum analyzer', exact: true });
  await spectrum.getByLabel('Log frequency', { exact: true }).check();
  const fft = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  await fft.locator('.anacode-scope__details > summary').click();
  const frequency = fft.getByRole('textbox', { name: 'Cursor A position', exact: true });
  await frequency.fill('1.234567k'); await frequency.press('Enter'); expect(Number(await frequency.inputValue())).toBeCloseTo(1234.567, 7);
  await fft.getByRole('textbox', { name: 'Cursor B position', exact: true }).fill('2k'); await fft.getByRole('textbox', { name: 'Cursor B position', exact: true }).press('Enter');
  await fft.screenshot({ path: 'artifacts/qa/precise-frequency-cursors.png' });
});
