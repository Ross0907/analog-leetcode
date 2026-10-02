import { expect, test, type Locator, type Page } from "@playwright/test";
import type { CircuitJsApi } from "../../lib/circuitjs";
import { CIRCUITJS_STARTERS } from "../../lib/circuitjs-starters";
import { parseEngineeringNumber } from "../../lib/engineering";

async function expectScopeCanvasFits(scope: Locator) {
  await expect.poll(() => scope.locator(".anacode-scope__canvas").evaluate((canvas) => {
    const viewportWidth = canvas.parentElement!.getBoundingClientRect().width;
    const displayWidth = canvas.getBoundingClientRect().width;
    const bitmapWidth = (canvas as HTMLCanvasElement).width / Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(Math.abs(viewportWidth - displayWidth), Math.abs(viewportWidth - bitmapWidth));
  }), { message: "The displayed canvas and its bitmap must fill the visible scope viewport" }).toBeLessThanOrEqual(1);
}

async function openSettings(page: Page, summary: string) {
  const disclosure = page.locator('details').filter({ has: page.locator('summary', { hasText: summary }) }).first();
  if (await disclosure.count() && await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
}

async function expectAreaZoom(page: Page, scope: Locator) {
  const range = async () => ({
    x0: Number(await scope.getAttribute('data-x-min')), x1: Number(await scope.getAttribute('data-x-max')),
    y0: Number(await scope.getAttribute('data-y-min')), y1: Number(await scope.getAttribute('data-y-max')),
  });
  const before = await range();
  const canvas = scope.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await range()).x1 - (await range()).x0).toBeLessThan((before.x1 - before.x0) * 0.8);
  expect((await range()).y1 - (await range()).y0).toBeLessThan((before.y1 - before.y0) * 0.8);
  await canvas.dblclick({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect.poll(async () => Math.abs((await range()).x0 - before.x0) + Math.abs((await range()).x1 - before.x1)).toBeLessThan(Math.max(1e-12, Math.abs(before.x1) * 1e-8));
}

async function rightClickRenderedTrace(page: Page, scope: Locator, name: string) {
  const color = await scope.getByRole('button', { name: 'Hide ' + name, exact: true }).evaluate((element) => getComputedStyle(element).color);
  const canvas = scope.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const point = await canvas.evaluate((element, cssColor) => {
    const canvas = element as HTMLCanvasElement, ratio = canvas.width / canvas.getBoundingClientRect().width;
    const rgb = cssColor.match(/\d+/g)!.slice(0, 3).map(Number);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    // Choose colored waveform pixels away from the horizontal trigger and cursor lines.
    for (let y = Math.round(32 * ratio); y < canvas.height - 55 * ratio; y++) {
      if (Math.abs(y / ratio - (18 + (canvas.height / ratio - 60) / 2)) < 14) continue;
      for (let x = Math.round(canvas.width * 0.31); x < canvas.width * 0.7; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (rgb.every((channel, i) => Math.abs(pixels[offset + i]! - channel) < 8)) return { x: x / ratio, y: y / ratio };
      }
    }
    return null;
  }, color);
  expect(point, 'A visible rendered waveform pixel must be present').not.toBeNull();
  await canvas.click({ button: 'right', position: point! });
  return page.getByRole('dialog', { name: 'Trace style: ' + name, exact: true });
}

async function expectPlotTheme(page: Page, scope: Locator, theme: 'light' | 'dark') {
  const switchButton = page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true });
  if (await switchButton.count()) await switchButton.click();
  await expect(scope).toHaveAttribute('data-theme', theme);
  await expect.poll(() => scope.locator('canvas').evaluate((element) => {
    const pixel = (element as HTMLCanvasElement).getContext('2d')!.getImageData(1, 1, 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]];
  })).toEqual(theme === 'light' ? [247, 249, 252] : [16, 20, 25]);
}

async function openSpice(page: Page) {
  await page.goto("/lab");
  await expect(page.getByRole("region", { name: "CircuitJS schematic and simulation workspace", exact: true }).locator('p[role="status"]')).toContainText("Editor ready", { timeout: 45_000 });
  await openSettings(page, "Analysis, sources & models");
  await page.getByLabel("SPICE analysis source", { exact: true }).selectOption("deck");
  await page.locator(".advanced-netlist > summary").click();
}

const branches = Array.from({ length: 6 }, (_, i) => `R${i * 2 + 1} vin n${i + 1} 1k\nR${i * 2 + 2} n${i + 1} 0 ${(i + 1) * 500}`).join("\n");

test("real ngspice acquires more than four probes and the waveform/FFT controls work", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openSpice(page);
  await page.getByRole("textbox", { name: "Advanced SPICE source editor" }).fill(`* Six independent divider taps\nV1 vin 0 SIN(0 1 1k)\n${branches}\n.tran 2u 2m\n.end`);
  await page.getByRole("textbox", { name: "Probe vectors", exact: true }).fill("vin, n1, n2, n3, n4, n5, n6, I(V1)");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  const voltageScope = page.getByRole("region", { name: "Oscilloscope · Voltage", exact: true });
  const currentScope = page.getByRole("region", { name: "Oscilloscope · Current", exact: true });
  await expect(voltageScope).toBeVisible({ timeout: 45_000 });
  await expect(currentScope).toBeVisible();
  await expectScopeCanvasFits(voltageScope);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expectScopeCanvasFits(voltageScope);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Workspace layout", { exact: true }).selectOption("tabs");
  await page.getByRole("button", { name: "Schematic", exact: true }).click();
  await page.getByRole("button", { name: "Oscilloscope & FFT", exact: true }).click();
  await page.getByLabel("Workspace layout", { exact: true }).selectOption("stacked");
  await expectScopeCanvasFits(voltageScope);
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(7);
  await expect(currentScope.getByRole("button", { name: "Hide I(v1)", exact: true })).toBeVisible();
  await voltageScope.locator(".anacode-scope__details > summary").click();
  await expect(voltageScope.getByRole("rowheader", { name: "V(n6) DC", exact: true })).toBeVisible();
  await voltageScope.getByRole("button", { name: "Hide V(n6)", exact: true }).click();
  await expect(voltageScope.getByRole("button", { name: "Show V(n6)", exact: true })).toBeVisible();
  await voltageScope.getByRole("button", { name: "Show V(n6)", exact: true }).click();
  await voltageScope.getByRole("button", { name: "Hide V(n6)", exact: true }).click({ button: "right" });
  await page.getByRole("dialog", { name: "Trace style: V(n6)", exact: true }).getByRole("textbox", { name: "Rename V(n6)", exact: true }).fill("Sense rail");
  await expect(voltageScope.getByRole("button", { name: "Hide Sense rail", exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Trace style: Sense rail", exact: true }).getByRole("button", { name: "Remove Sense rail", exact: true }).click();
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(6);
  await voltageScope.getByRole("button", { name: "Restore removed traces" }).click();
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(7);
  await expectAreaZoom(page, voltageScope);
  await expectPlotTheme(page, voltageScope, 'light');
  const traceMenu = await rightClickRenderedTrace(page, voltageScope, 'V(vin)');
  await expect(traceMenu).toBeVisible();
  await traceMenu.getByLabel('Line color', { exact: true }).fill('#8333aa');
  await traceMenu.getByRole('combobox', { name: 'Line thickness', exact: true }).selectOption('4');
  await page.keyboard.press('Escape');
  await expect(traceMenu).toHaveCount(0);
  await expectPlotTheme(page, voltageScope, 'dark');
  const styled = await rightClickRenderedTrace(page, voltageScope, 'V(vin)');
  await expect(styled.getByRole('combobox', { name: 'Line thickness', exact: true })).toHaveValue('4');
  await expect(styled.getByLabel('Line color', { exact: true })).toHaveValue('#8333aa');
  await page.keyboard.press('Escape');
  await voltageScope.getByRole("button", { name: "Zoom in waveform", exact: true }).click();
  await expect(voltageScope.getByRole("combobox", { name: "Time/div" })).not.toHaveValue("auto");
  await voltageScope.getByRole("slider", { name: "Waveform horizontal position", exact: true }).press("End");
  await voltageScope.getByRole("slider", { name: "Amplitude cursor A", exact: true }).press("Home");
  await voltageScope.getByRole("button", { name: "Reset oscilloscope view" }).click();
  await expectScopeCanvasFits(voltageScope);
  await voltageScope.screenshot({ path: "artifacts/qa/multiple-probe-oscilloscope.png", style: ".site-header { visibility: hidden !important; }" });
  await page.getByRole("button", { name: "Spectrum", exact: true }).click();
  const spectrum = page.getByRole("region", { name: "Spectrum analyzer", exact: true });
  await expect(spectrum).toBeVisible();
  await spectrum.getByRole("combobox", { name: "FFT samples", exact: true }).selectOption("512");
  await spectrum.getByRole("combobox", { name: "Channel", exact: true }).selectOption({ label: "V(n6)" });
  await spectrum.getByRole("combobox", { name: "Window", exact: true }).selectOption("blackman");
  await spectrum.getByRole("checkbox", { name: "Log frequency", exact: true }).check();
  await spectrum.getByRole("checkbox", { name: "Magnitude in dB", exact: true }).uncheck();
  await expect(spectrum.getByRole("region", { name: "FFT spectrum", exact: true })).toBeVisible();
  const fftPlot = spectrum.getByRole('region', { name: 'FFT spectrum', exact: true });
  await expectAreaZoom(page, fftPlot);
  await expectPlotTheme(page, fftPlot, 'light');
  const fftMenu = await rightClickRenderedTrace(page, fftPlot, 'V(n6)');
  await expect(fftMenu).toBeVisible();
  await fftMenu.getByRole('combobox', { name: 'Line thickness', exact: true }).selectOption('3');
  await page.keyboard.press('Escape');
  await spectrum.getByRole("spinbutton", { name: "Marker / Hz", exact: true }).fill("1000");
  await expect(spectrum.getByText(/Marker:/)).toContainText("Hz");
  await spectrum.screenshot({ path: "artifacts/qa/fft-analyzer.png", style: ".site-header { visibility: hidden !important; }" });
  await page.getByRole('button', { name: 'Oscilloscope', exact: true }).click();
  const restoredStyle = await rightClickRenderedTrace(page, voltageScope, 'V(vin)');
  await expect(restoredStyle.getByRole('combobox', { name: 'Line thickness', exact: true })).toHaveValue('4');
  await expect(restoredStyle.getByLabel('Line color', { exact: true })).toHaveValue('#8333aa');
  await page.keyboard.press('Escape');
  await voltageScope.screenshot({ path: 'artifacts/qa/multiple-probe-oscilloscope-light.png', style: '.site-header { visibility: hidden !important; }' });
  await expect(page.getByText("Simulation stopped", { exact: true })).toHaveCount(0);
  expect(pageErrors, "Instrument resizing and tab changes must not raise runtime errors").toEqual([]);
});

test("AC Bode and DC operating point use the actual solver; missing probes fail visibly", async ({ page }) => {
  await openSpice(page);
  const editor = page.getByRole("textbox", { name: "Advanced SPICE source editor" });
  await editor.fill("* RC low pass\nV1 vin 0 DC 1 AC 1\nR1 vin out 1k\nC1 out 0 1u\n.ac dec 20 10 100k\n.end");
  await page.getByRole("textbox", { name: "Probe vectors", exact: true }).fill("vin, out");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByRole("region", { name: "Bode magnitude", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("region", { name: "Bode phase", exact: true })).toBeVisible();
  await expectAreaZoom(page, page.getByRole('region', { name: 'Bode magnitude', exact: true }));
  await expectAreaZoom(page, page.getByRole('region', { name: 'Bode phase', exact: true }));
  const bode = page.getByRole('region', { name: 'Bode magnitude', exact: true });
  await expectPlotTheme(page, bode, 'light');
  expect(await bode.locator('.anacode-scope__trigger').count()).toBe(0);
  await page.getByRole("textbox", { name: "Probe vectors", exact: true }).fill("not_connected");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByText(/Probe not_connected is unavailable/)).toBeVisible({ timeout: 45_000 });
  await editor.fill('* Divider DC sweep\nV1 vin 0 DC 1\nR1 vin out 1k\nR2 out 0 1k\n.dc V1 0 5 0.1\n.end');
  await page.getByRole('textbox', { name: 'Probe vectors', exact: true }).fill('out');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const curve = page.getByRole('region', { name: 'Curve tracer', exact: true });
  await expect(curve).toBeVisible({ timeout: 45_000 });
  await expectAreaZoom(page, curve);
  const curveMenu = await rightClickRenderedTrace(page, curve, 'V(out)');
  await expect(curveMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await editor.fill("* Divider operating point\nV1 vin 0 2\nR1 vin out 1k\nR2 out 0 1k\n.op\n.end");
  await page.getByRole("textbox", { name: "Probe vectors", exact: true }).fill("");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.locator(".op-grid")).toContainText("I(v1)", { timeout: 45_000 });
  await expect(page.locator(".op-grid")).toContainText("1 V");
  await expect(page.locator(".op-grid")).toContainText("mA");
});

test("the native CircuitJS editor captures node and component probes into shared instruments", async ({ page }) => {
  await page.goto("/lab");
  const workspace = page.getByRole("region", { name: "CircuitJS schematic and simulation workspace", exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText("Editor ready", { timeout: 45_000 });
  await openSettings(page, "Probes & capture settings");
  await expect(workspace.getByLabel("Probe 1 name", { exact: true })).toBeVisible();
  await workspace.getByRole("combobox", { name: "Node voltage probe", exact: true }).selectOption("0");
  await workspace.getByRole("button", { name: "Add voltage", exact: true }).click();
  const currentChoices = workspace.getByRole("combobox", { name: "Component current probe", exact: true });
  await currentChoices.selectOption("0");
  await workspace.getByRole("button", { name: "Add current", exact: true }).click();
  await currentChoices.selectOption("1");
  await workspace.getByRole("button", { name: "Add current", exact: true }).click();
  await expect(workspace.getByLabel("Probe 5 name", { exact: true })).toBeVisible();
  await workspace.getByLabel("Capture duration in seconds", { exact: true }).fill("0.01");
  await workspace.getByRole("combobox", { name: "Capture target samples", exact: true }).selectOption("1024");
  await workspace.getByRole("button", { name: "Capture all probes", exact: true }).click();
  await expect(workspace.locator('p[role="status"]')).toContainText("across 5 probes", { timeout: 45_000 });
  await expect(workspace.getByRole("region", { name: "Oscilloscope · Voltage", exact: true }).locator(".anacode-scope__channel")).toHaveCount(3);
  await expect(workspace.getByRole("region", { name: "Oscilloscope · Current", exact: true }).locator(".anacode-scope__channel")).toHaveCount(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  const compactScope = workspace.getByRole('region', { name: 'Oscilloscope · Voltage', exact: true });
  await expect.poll(() => compactScope.evaluate((element) => element.querySelector('canvas')!.getBoundingClientRect().top - element.getBoundingClientRect().top)).toBeLessThan(145);
  await compactScope.screenshot({ path: 'artifacts/qa/native-probe-scope-compact.png', style: '.site-header { visibility: hidden !important; }' });
  await workspace.getByRole("button", { name: "Spectrum", exact: true }).click();
  const spectrum = workspace.getByRole("region", { name: "Spectrum analyzer", exact: true });
  await spectrum.getByRole("combobox", { name: "FFT samples", exact: true }).selectOption("256");
  await expect(spectrum.getByRole("region", { name: "FFT spectrum", exact: true })).toBeVisible();
});

test("live acquisition remains bounded, updates real samples and freezes without pausing the solver", async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText('Editor ready', { timeout: 45000 });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  await openSettings(page, 'Probes & capture settings');
  const settings = workspace.getByLabel('Capture target samples', { exact: true });
  await expect(settings).toHaveValue('65536');
  await settings.selectOption('131072');
  await expect(settings).toHaveValue('131072');
  await settings.selectOption('1024');
  await workspace.getByLabel('Probe 1 name', { exact: true }).fill('Input rail');
  await workspace.getByRole('button', { name: 'Start live measurements', exact: true }).click();
  const status = workspace.getByLabel('Live acquisition status', { exact: true });
  const samples = async () => Number((await status.textContent())!.replace(/[^0-9]/g, ''));
  await expect.poll(samples, { timeout: 45000 }).toBeGreaterThan(500);
  expect(await samples()).toBeLessThanOrEqual(1024);
  await expect(workspace.getByRole('region', { name: 'Oscilloscope', exact: true })).toBeVisible();
  await expect(workspace.getByRole('region', { name: 'Oscilloscope', exact: true }).getByRole('button', { name: 'Hide Input rail', exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Scope + FFT', exact: true }).click();
  await expect(workspace.getByRole('region', { name: 'FFT spectrum', exact: true })).toBeVisible();
  const timeBefore = await native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getTime());
  await expect.poll(() => native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getTime())).toBeGreaterThan(timeBefore);
  await workspace.getByRole('button', { name: 'Logic analyzer', exact: true }).click();
  const logic = workspace.getByRole('region', { name: 'Logic analyzer', exact: true });
  await expect(logic.getByRole('img', { name: 'Input rail digital waveform', exact: true })).toBeVisible();
  await logic.getByRole('checkbox').first().check();
  await expect(logic.getByLabel('Logic bus value', { exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Freeze measurements', exact: true }).click();
  await expect(status).toHaveCount(0);
  expect(await native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.isRunning())).toBe(true);
  const lane = logic.getByRole('img', { name: 'Input rail digital waveform', exact: true });
  await lane.scrollIntoViewIfNeeded();
  const laneBox = (await lane.boundingBox())!;
  const oldSpan = Number(await logic.getAttribute('data-x-max')) - Number(await logic.getAttribute('data-x-min'));
  await page.mouse.move(laneBox.x + laneBox.width * 0.2, laneBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(laneBox.x + laneBox.width * 0.7, laneBox.y + 30, { steps: 4 });
  await page.mouse.up();
  expect(Number(await logic.getAttribute('data-x-max')) - Number(await logic.getAttribute('data-x-min'))).toBeLessThan(oldSpan * 0.6);
  await logic.getByRole('button', { name: 'Reset view', exact: true }).click();
  const tracePoint = await lane.locator('path').evaluate((element) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() * 0.3).matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(tracePoint.x, tracePoint.y, { button: 'right' });
  const logicMenu = page.getByRole('dialog', { name: 'Trace style: Input rail', exact: true });
  await expect(logicMenu).toBeVisible();
  await logicMenu.getByRole('combobox', { name: 'Line thickness', exact: true }).selectOption('4');
  await page.keyboard.press('Escape');
  await expect(lane.locator('path')).toHaveAttribute('stroke-width', '4');
  const frozen = await logic.getByRole('img', { name: 'Input rail digital waveform', exact: true }).locator('path').getAttribute('d');
  const frozenTime = await native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getTime());
  await expect.poll(() => native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getTime())).toBeGreaterThan(frozenTime);
  await expect(logic.getByRole('img', { name: 'Input rail digital waveform', exact: true }).locator('path')).toHaveAttribute('d', frozen!);
  await workspace.getByLabel('Workspace layout', { exact: true }).selectOption('tabs');
  await workspace.getByRole('button', { name: 'Schematic', exact: true }).click();
  await expect(logic).toBeHidden();
  await workspace.getByRole('button', { name: 'Oscilloscope & FFT', exact: true }).click();
  await expect(logic).toBeVisible();
  expect(errors).toEqual([]);
});

test("SPICE reads changed native component values and never silently substitutes an unsupported graph", async ({ page }) => {
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText('Editor ready', { timeout: 45000 });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  await native.locator('body').evaluate((_, text) => { const api = (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1; api.importCircuit(text, false); api.setSimRunning(true); }, CIRCUITJS_STARTERS['precision-voltage-divider']!);
  await openSettings(page, 'Probes & capture settings');
  await expect(workspace.getByLabel('Probe 1 name', { exact: true })).toHaveValue('V(vin)');
  await openSettings(page, 'Analysis, sources & models');
  await workspace.getByLabel('Schematic analysis type', { exact: true }).selectOption('operating-point');
  await expect(workspace.getByLabel('SPICE analysis source', { exact: true })).toHaveValue('schematic');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(workspace.locator('.op-grid')).toContainText('2.5 V', { timeout: 45000 });
  const editError = await native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().filter((element) => element.getType() === 'ResistorElm')[1]!.setEditableValue('20k'));
  expect(editError).toBeNull();
  await expect.poll(() => native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().filter((element) => element.getType() === 'ResistorElm')[1]!.getEditableValue()?.value)).toBe(20000);
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(workspace.locator('.op-grid')).toContainText('3.333 V', { timeout: 45000 });
  await native.locator('body').evaluate((_, text) => { const api = (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1; api.importCircuit(text, false); api.setSimRunning(true); }, CIRCUITJS_STARTERS['inverting-gain-stage']!);
  await expect.poll(() => native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().some((element) => element.getType() === 'OpAmpElm'))).toBe(true);
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const opampOutput = workspace.locator('.op-grid > div').filter({ has: page.locator('span', { hasText: /^V\(vout\)$/ }) }).locator('strong');
  await expect(opampOutput).toBeVisible({ timeout: 45000 });
  const outputVolts = parseEngineeringNumber((await opampOutput.innerText()).replace(/\s+/g, '').replace(/V$/, '').replace('µ', 'u'));
  expect(outputVolts, 'The measured inverting-amplifier output must be approximately −1 V').not.toBeNull();
  expect(outputVolts!).toBeCloseTo(-1, 3);
  const unsupported = CIRCUITJS_STARTERS['precision-voltage-divider']!.replace('r 352 112 352 224 0 10000', 's 352 112 352 224 0 0 false');
  await native.locator('body').evaluate((_, text) => { const api = (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1; api.importCircuit(text, false); api.setSimRunning(true); }, unsupported);
  await expect.poll(() => native.locator('body').evaluate(() => (window as Window & { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().some((element) => element.getType() === 'SwitchElm'))).toBe(true);
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(workspace.getByText(/Switch is not supported by SPICE conversion yet/)).toBeVisible();
  await expect(workspace.locator('.op-grid')).toHaveCount(0);
});


