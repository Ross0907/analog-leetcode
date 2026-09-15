import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectScopeCanvasFits(scope: Locator) {
  await expect.poll(() => scope.locator(".anacode-scope__canvas").evaluate((canvas) => {
    const viewportWidth = canvas.parentElement!.getBoundingClientRect().width;
    const displayWidth = canvas.getBoundingClientRect().width;
    const bitmapWidth = (canvas as HTMLCanvasElement).width / Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(Math.abs(viewportWidth - displayWidth), Math.abs(viewportWidth - bitmapWidth));
  }), { message: "The displayed canvas and its bitmap must fill the visible scope viewport" }).toBeLessThanOrEqual(1);
}

async function openSpice(page: Page) {
  await page.goto("/lab");
  await expect(page.getByRole("region", { name: "CircuitJS schematic and simulation workspace", exact: true }).locator('p[role="status"]')).toContainText("Editor ready", { timeout: 45_000 });
  await page.getByRole("tab", { name: "SPICE analysis", exact: true }).click();
  await expect(page.getByRole("tab", { name: "SPICE analysis", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.locator(".advanced-netlist > summary").click();
}

const branches = Array.from({ length: 6 }, (_, i) => `R${i * 2 + 1} vin n${i + 1} 1k\nR${i * 2 + 2} n${i + 1} 0 ${(i + 1) * 500}`).join("\n");

test("real ngspice acquires more than four probes and the waveform/FFT controls work", async ({ page }) => {
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
  await page.getByRole("tab", { name: "Schematic editor", exact: true }).click();
  await page.getByRole("tab", { name: "SPICE analysis", exact: true }).click();
  await expectScopeCanvasFits(voltageScope);
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(7);
  await expect(currentScope.getByRole("button", { name: "Hide I(v1)", exact: true })).toBeVisible();
  await expect(voltageScope.getByRole("rowheader", { name: "V(n6) DC", exact: true })).toBeVisible();
  await voltageScope.getByRole("button", { name: "Hide V(n6)", exact: true }).click();
  await expect(voltageScope.getByRole("button", { name: "Show V(n6)", exact: true })).toBeVisible();
  await voltageScope.getByRole("button", { name: "Show V(n6)", exact: true }).click();
  await voltageScope.getByRole("textbox", { name: "Rename V(n6)", exact: true }).fill("Sense rail");
  await expect(voltageScope.getByRole("button", { name: "Hide Sense rail", exact: true })).toBeVisible();
  await voltageScope.getByRole("button", { name: "Remove Sense rail", exact: true }).click();
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(6);
  await voltageScope.getByRole("button", { name: "Restore removed traces" }).click();
  await expect(voltageScope.locator(".anacode-scope__channel")).toHaveCount(7);
  await voltageScope.getByRole("button", { name: "Zoom in waveform", exact: true }).click();
  await expect(voltageScope.getByRole("combobox", { name: "Time/div" })).not.toHaveValue("auto");
  await voltageScope.getByRole("slider", { name: "Waveform horizontal position", exact: true }).press("End");
  await voltageScope.getByRole("slider", { name: "Amplitude cursor A", exact: true }).press("Home");
  await voltageScope.getByRole("button", { name: "Reset oscilloscope view" }).click();
  await expectScopeCanvasFits(voltageScope);
  await voltageScope.screenshot({ path: "artifacts/qa/multiple-probe-oscilloscope.png", style: ".site-header { visibility: hidden !important; }" });
  const spectrum = page.getByRole("region", { name: "Spectrum analyzer", exact: true });
  await expect(spectrum).toBeVisible();
  await spectrum.getByRole("combobox", { name: "FFT samples", exact: true }).selectOption("512");
  await spectrum.getByRole("combobox", { name: "Channel", exact: true }).selectOption({ label: "V(n6)" });
  await spectrum.getByRole("combobox", { name: "Window", exact: true }).selectOption("blackman");
  await spectrum.getByRole("checkbox", { name: "Log frequency", exact: true }).check();
  await spectrum.getByRole("checkbox", { name: "Magnitude in dB", exact: true }).uncheck();
  await expect(spectrum.getByRole("region", { name: "FFT spectrum", exact: true })).toBeVisible();
  await spectrum.getByRole("spinbutton", { name: "Marker / Hz", exact: true }).fill("1000");
  await expect(spectrum.getByText(/Marker:/)).toContainText("Hz");
  await spectrum.screenshot({ path: "artifacts/qa/fft-analyzer.png", style: ".site-header { visibility: hidden !important; }" });
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
  await page.getByRole("textbox", { name: "Probe vectors", exact: true }).fill("not_connected");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByText(/Probe not_connected is unavailable/)).toBeVisible({ timeout: 45_000 });
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
  const spectrum = workspace.getByRole("region", { name: "Spectrum analyzer", exact: true });
  await spectrum.getByRole("combobox", { name: "FFT samples", exact: true }).selectOption("256");
  await expect(spectrum.getByRole("region", { name: "FFT spectrum", exact: true })).toBeVisible();
});


