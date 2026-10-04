import { expect, test, type Locator, type Page } from '@playwright/test';

async function workbench(page: Page, path = '/lab') {
  await page.goto(path);
  const root = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(root.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect(root.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible({ timeout: 60000 });
  return root;
}

const range = async (plot: Locator) => ({ x0: Number(await plot.getAttribute('data-x-min')), x1: Number(await plot.getAttribute('data-x-max')), y0: Number(await plot.getAttribute('data-y-min')), y1: Number(await plot.getAttribute('data-y-max')) });

async function wheel(page: Page, target: Locator, modifiers: string[]) {
  await target.scrollIntoViewIfNeeded(); const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .4);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.wheel(0, -120);
  for (const key of [...modifiers].reverse()) await page.keyboard.up(key);
}

async function checkPlotWheel(page: Page, plot: Locator, log = false) {
  const canvas = plot.locator('canvas'), initial = await range(plot);
  const span = (value: Awaited<ReturnType<typeof range>>) => log ? Math.log(value.x1 / value.x0) : value.x1 - value.x0;
  const scale = await page.evaluate(() => window.devicePixelRatio);
  const plainAllowed = await canvas.evaluate(canvas => { const bounds = canvas.getBoundingClientRect(); return canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 })); });
  expect(plainAllowed, 'Unmodified wheel must retain default scrolling').toBe(true);
  expect(await range(plot)).toEqual(initial);
  await wheel(page, canvas, ['Control', 'Shift']);
  await expect.poll(async () => span(await range(plot))).toBeLessThan(span(initial) * .85);
  const horizontal = await range(plot);
  expect(horizontal.y1 - horizontal.y0).toBeCloseTo(initial.y1 - initial.y0, 7);
  await wheel(page, canvas, ['Alt']);
  await expect.poll(async () => (await range(plot)).y1 - (await range(plot)).y0).toBeLessThan((horizontal.y1 - horizontal.y0) * .85);
  expect(span(await range(plot))).toBeCloseTo(span(horizontal), 7);
  const beforeBoth = await range(plot);
  await wheel(page, canvas, ['Control']);
  await expect.poll(async () => span(await range(plot))).toBeLessThan(span(beforeBoth) * .85);
  expect((await range(plot)).y1 - (await range(plot)).y0).toBeLessThan((beforeBoth.y1 - beforeBoth.y0) * .85);
  expect(await page.evaluate(() => window.devicePixelRatio), 'Instrument zoom must not zoom the browser').toBe(scale);
  await plot.getByRole('button', { name: 'Auto set', exact: true }).click();
}

test('wheel zoom works on scope, FFT, logic, logarithmic Bode and DC curves without taking plain scrolling', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const root = await workbench(page);
  await checkPlotWheel(page, root.getByRole('region', { name: 'Oscilloscope', exact: true }));
  await root.getByRole('button', { name: 'Spectrum', exact: true }).click();
  await checkPlotWheel(page, root.getByRole('region', { name: 'FFT spectrum', exact: true }));
  await root.getByRole('button', { name: 'Logic analyzer', exact: true }).click();
  const logic = root.getByRole('region', { name: 'Logic analyzer', exact: true }), initialLogic = await range(logic);
  await wheel(page, logic.getByRole('img').first(), ['Control']);
  await expect.poll(async () => (await range(logic)).x1 - (await range(logic)).x0).toBeLessThan((initialLogic.x1 - initialLogic.x0) * .85);
  await logic.getByRole('button', { name: 'Reset view', exact: true }).click();
  expect((await range(logic)).x1 - (await range(logic)).x0).toBeCloseTo(initialLogic.x1 - initialLogic.x0, 7);
  await root.getByLabel('Schematic analysis type', { exact: true }).selectOption('ac-sweep');
  await root.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const bode = root.getByRole('region', { name: 'Bode magnitude', exact: true });
  await expect(bode).toBeVisible({ timeout: 45000 });
  await checkPlotWheel(page, bode, true);
  await root.getByLabel('Schematic analysis type', { exact: true }).selectOption('dc-sweep');
  await root.getByLabel('DC sweep source', { exact: true }).selectOption('0');
  await root.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const curve = root.getByRole('region', { name: 'Curve tracer', exact: true });
  await expect(curve).toBeVisible({ timeout: 45000 });
  await checkPlotWheel(page, curve);
  expect(errors).toEqual([]);
});

test('inline trace color picker supports keyboard, swatches and hex entry in both themes', async ({ page }) => {
  const root = await workbench(page), scope = root.getByRole('region', { name: 'Oscilloscope', exact: true });
  await scope.getByRole('button', { name: 'Select V(vin)', exact: true }).click({ button: 'right' });
  const menu = page.getByRole('dialog', { name: 'Trace style: V(vin)', exact: true });
  await expect(menu.locator('input[type="color"]')).toHaveCount(0);
  await menu.getByRole('textbox', { name: 'Line color', exact: true }).fill('#8333aa');
  await menu.getByRole('slider', { name: 'Line color hue', exact: true }).press('Home');
  await expect(menu.getByRole('textbox', { name: 'Line color', exact: true })).toHaveValue('#aa3333');
  await menu.getByRole('slider', { name: 'Line color saturation', exact: true }).press('End');
  await menu.getByRole('slider', { name: 'Line color brightness', exact: true }).press('End');
  await expect(menu.getByRole('textbox', { name: 'Line color', exact: true })).toHaveValue('#ff0000');
  await menu.getByRole('button', { name: 'Line color: #19a7ce', exact: true }).click();
  await expect(menu.getByRole('textbox', { name: 'Line color', exact: true })).toHaveValue('#19a7ce');
  await menu.screenshot({ path: 'artifacts/qa/inline-color-picker-light.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await scope.getByRole('button', { name: 'Select V(vin)', exact: true }).click({ button: 'right' });
  await menu.screenshot({ path: 'artifacts/qa/inline-color-picker-dark.png' });
  await expect(menu.getByRole('textbox', { name: 'Line color', exact: true })).toHaveValue('#19a7ce');
});

test('lesson15 FFT starts with a visible physical 1kHz peak and retains the full Nyquist data', async ({ page }) => {
  const root = await workbench(page, '/problems/rc-high-pass');
  await root.getByRole('button', { name: 'Spectrum', exact: true }).click();
  const spectrum = root.getByRole('region', { name: 'Spectrum analyzer', exact: true }), plot = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  await expect(spectrum).toHaveAttribute('data-fft-used', '8192');
  expect(Number(await plot.getAttribute('data-x-max'))).toBeGreaterThan(2000);
  expect(Number(await plot.getAttribute('data-x-max'))).toBeLessThan(10000);
  await spectrum.getByRole('spinbutton', { name: 'Marker / Hz', exact: true }).fill('1000');
  await expect(spectrum.getByText(/^Marker:/)).toContainText('-5.483 dB');
  await plot.screenshot({ path: 'artifacts/qa/lesson15-fft-signal-band.png' });
  await spectrum.getByLabel('Spectrum frequency range', { exact: true }).selectOption('full');
  expect(Number(await plot.getAttribute('data-x-max'))).toBeGreaterThan(800000);
  await expect(spectrum.getByText(/^Marker:/)).toContainText('-5.483 dB');
});
