import { expect, test, type Frame, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CircuitJsApi } from '../../lib/circuitjs';

async function nativeEditor(page: Page): Promise<Frame> {
  await expect(page.locator('p[role="status"]')).toContainText('Captured', { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeEnabled({ timeout: 30_000 });
  const frame = await (await page.locator('iframe[title="CircuitJS schematic editor"]').elementHandle())?.contentFrame();
  if (!frame) throw new Error('The native editor frame is missing.');
  return frame;
}
async function showProbeSettings(page: Page) {
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Probes & capture settings' }) }).first();
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}
async function point(page: Page, frame: Frame, x: number, y: number) {
  const offset = await frame.evaluate(({ x, y }) => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.left + api.screenX(x), y: rect.top + api.screenY(y) };
  }, { x, y });
  const bounds = await page.locator('iframe[title="CircuitJS schematic editor"]').boundingBox();
  if (!bounds) throw new Error('The editor is not visible.');
  return { x: bounds.x + offset.x, y: bounds.y + offset.y };
}

test('native branching splits a wire, preserves its electrical node, and supports undo/redo', async ({ page }) => {
  await page.goto('/problems/precision-voltage-divider');
  const frame = await nativeEditor(page);
  await page.getByLabel('Workspace layout', { exact: true }).selectOption('tabs');
  await page.getByRole('button', { name: 'Schematic', exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await frame.locator('canvas').scrollIntoViewIfNeeded();
  await frame.locator('canvas').focus();
  // Focus/scroll and the layout change must settle before projecting native coordinates.
  await frame.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length);
  const start = await point(page, frame, 240, 112);
  const end = await point(page, frame, 240, 176);
  await page.keyboard.press('w');
  await expect(frame.locator('canvas')).toHaveCSS('cursor', 'crosshair');
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.click(end.x, end.y);
  await page.keyboard.press('Escape');
  await expect.poll(() => frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length)).toBeGreaterThan(before);
  const branchVoltage = () => frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    for (const element of api.getElements()) for (let post = 0; post < element.getPostCount(); post++) if (element.getPostX(post) === 240 && element.getPostY(post) === 176) return element.getVoltage(post);
    return null;
  });
  await expect.poll(() => frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    const elements = api.getElements();
    const branch = elements.find((element) => element.getType() === 'RoutedWireElm' && element.getPostX(0) === 240 && element.getPostY(0) === 112 && element.getPostX(1) === 240 && element.getPostY(1) === 176);
    const source = elements.find((element) => element.getType() === 'VoltageElm');
    const junctionPosts = elements.flatMap((element) => Array.from({ length: element.getPostCount() }, (_, post) => ({ x: element.getPostX(post), y: element.getPostY(post), node: element.getNodeId(post) }))).filter((post) => post.x === 240 && post.y === 112);
    return Boolean(branch && source && junctionPosts.length === 3 && junctionPosts.every((post) => post.node === source.getNodeId(1)) && branch.getNodeId(1) === source.getNodeId(1));
  })).toBe(true);
  await expect.poll(branchVoltage).toBeCloseTo(5, 6);
  await frame.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await frame.getByRole('menuitem', { name: /Undo/ }).click({ timeout: 10_000 });
  await expect.poll(branchVoltage).toBeNull();
  await frame.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await frame.getByRole('menuitem', { name: /Redo/ }).click({ timeout: 10_000 });
  await expect.poll(branchVoltage).toBeCloseTo(5, 6);
  await page.screenshot({ path: 'artifacts/qa/native-wire-branch.png', fullPage: true });
});

test('native probes can be placed on the schematic and saved with an interoperable export', async ({ page }) => {
  await page.goto('/problems/sallen-key-q');
  const frame = await nativeEditor(page);
  await page.getByRole('button', { name: 'Voltage probe', exact: true }).click();
  const initialCount = await page.getByRole('button', { name: /^Move probe / }).count();
  const ground = await frame.evaluate(() => { const element = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().find(element => element.getType() === 'GroundElm')!; return {x:element.getPostX(0),y:element.getPostY(0)}; });
  const target = await point(page, frame, ground.x, ground.y);
  const addedProbeName = `Probe ${initialCount + 1} name`;
  await page.mouse.move(target.x, target.y); await page.mouse.click(target.x, target.y);
  await showProbeSettings(page);
  await expect(page.getByRole('textbox', { name: addedProbeName })).toBeVisible();
  await page.getByRole('textbox', { name: addedProbeName }).fill('Ground reference');
  await page.getByLabel('Capture duration in seconds').fill('0.02');
  await page.getByLabel('Capture target samples').selectOption('4096');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText('saved in this browser');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('sallen-key-q.circuitjs.txt');
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toMatch(/^<cir[\s>]/);
  await page.reload(); await nativeEditor(page);
  await showProbeSettings(page);
  await expect(page.getByRole('textbox', { name: addedProbeName })).toHaveValue('Ground reference');
  await expect(page.getByLabel('Capture duration in seconds')).toHaveValue('0.02');
  await expect(page.getByLabel('Capture target samples')).toHaveValue('4096');
});

test('grading reads fresh native electrical values and connectivity', async ({ page }) => {
  await page.goto('/problems/precision-voltage-divider'); const frame = await nativeEditor(page);
  await page.getByLabel('Workspace layout', { exact: true }).selectOption('tabs');
  await page.getByRole('button', { name: 'SPICE & grading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Oscilloscope & FFT', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('SPICE analysis source', { exact: true })).toHaveValue('schematic');
  await page.getByLabel('Schematic analysis type', { exact: true }).selectOption('operating-point');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.op-grid')).toContainText('2.5 V', { timeout: 45_000 });
  // A later edit must be read again by Check, without requiring a prepared snapshot.
  const edits = await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().filter((element) => element.getType() === 'ResistorElm').map((element) => element.setEditableValue('12k')));
  expect(edits).toEqual([null, null]);
  const gradeResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/grade' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Check fixed topology' }).click();
  const response = await gradeResponse;
  const submitted = response.request().postDataJSON().circuitDocument as { components: Array<{ kind: string; parameters: { resistanceOhm?: number } }> };
  expect(submitted.components.filter((component) => component.kind === 'resistor').map((component) => component.parameters.resistanceOhm)).toEqual([12000, 12000]);
  const result = await response.json();
  expect(response.status(), `Grading API returned ${response.status()}: ${JSON.stringify(result)}`).toBe(200);
  expect(result.passed).toBe(true);
  await expect(page.getByText('Fixed-topology check passed', { exact: true })).toBeVisible({ timeout: 20_000 });
});

test('invalid imports show an actionable error and retain the native circuit', async ({ page }) => {
  await page.goto('/lab'); const frame = await nativeEditor(page);
  const before = await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length);
  await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a native circuit') });
  await expect(page.getByRole('alert')).toContainText('Choose a CircuitJS circuit');
  expect(await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length)).toBe(before);
  await showProbeSettings(page);
  const probeNames = page.getByRole('textbox', { name: /^Probe \d+ name$/ });
  await expect(probeNames).toHaveCount(2);
  const probesBefore = await probeNames.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await page.locator('input[type="file"]').setInputFiles({ name: 'broken.xml', mimeType: 'application/xml', buffer: Buffer.from('<cir><broken') });
  await expect(page.getByRole('alert')).toContainText('well-formed CircuitJS XML');
  expect(await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length)).toBe(before);
  expect(await probeNames.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(probesBefore);
});

test('the supplied Sallen-Key SPICE model produces real Bode instruments', async ({ page }) => {
  await page.goto('/problems/sallen-key-q'); await nativeEditor(page);
  await page.getByRole('button', { name: 'SPICE & grading', exact: true }).click();
  await page.getByLabel('SPICE analysis source', { exact: true }).selectOption('deck');
  await expect(page.getByText('This is a separate SPICE example or custom deck. Schematic edits are not reflected in this analysis.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Bode magnitude' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('region', { name: 'Bode phase' })).toBeVisible();
  await expect(page.getByText('Simulation stopped', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/qa/sallen-instruments.png', fullPage: true });
});

test('challenge authoring template is visible, typed, and downloadable', async ({ page }) => {
  await page.goto('/problems/new');
  await expect(page.getByRole('heading', { name: 'Start from a real challenge contract.' })).toBeVisible();
  await expect(page.locator('[data-authoring-ready="true"]')).toBeVisible();
  const response = await page.request.get('/api/challenge-template'); expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('application/json');
  const template = await response.json(); expect(template.schema).toBe('anacode.challenge-template'); expect(template.schemaVersion).toBe(1);
  await page.getByLabel('Title', { exact: true }).fill('Low-noise sensor divider');
  await expect(page.getByLabel('URL slug', { exact: true })).toHaveValue('low-noise-sensor-divider');
  const summary = page.getByLabel('Summary', { exact: true }); const exportButton = page.getByRole('button', { name: /Download validated JSON/i });
  await summary.fill(''); await expect(exportButton).toBeDisabled();
  await summary.fill('Design a divider that meets the specified sensor-bias target.'); await expect(exportButton).toBeEnabled();
  await page.getByRole('combobox', { name: 'Starting connections', exact: true }).selectOption('parts-only');
  await expect(page.getByRole('textbox', { name: 'Wiring guidance', exact: true })).toHaveValue(/source/);
  const downloadEvent = page.waitForEvent('download'); await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('anacode-low-noise-sensor-divider.challenge.v1.json');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.workspace.starterSchematic.partsOnly.nativePresetSlug).toBe('wire-adc-reference');
  expect(exported.workspace.starterSchematic.partsOnly.outputLabel).toBe('vout');
  expect(exported.workspace.starterSchematic.partsOnly.autoProbeOutput).toBe(true);
});

test('the native workspace is contained on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/problems/precision-voltage-divider'); await nativeEditor(page);
  await expect(page.locator('iframe[title="CircuitJS schematic editor"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/qa/editor-mobile.png', fullPage: true });
});
