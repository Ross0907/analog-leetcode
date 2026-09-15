import { expect, test, type Frame, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

async function nativeEditor(page: Page): Promise<Frame> {
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeEnabled({ timeout: 30_000 });
  const frame = await (await page.locator('iframe[title="CircuitJS schematic editor"]').elementHandle())?.contentFrame();
  if (!frame) throw new Error('The native editor frame is missing.');
  return frame;
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
  const before = await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length);
  const start = await point(page, frame, 240, 112);
  const end = await point(page, frame, 240, 176);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.press('w');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect.poll(() => frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length)).toBeGreaterThan(before);
  const branchVoltage = () => frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    for (const element of api.getElements()) for (let post = 0; post < element.getPostCount(); post++) if (element.getPostX(post) === 240 && element.getPostY(post) === 176) return element.getVoltage(post);
    return null;
  });
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
  const target = await point(page, frame, 560, 224);
  await page.mouse.move(target.x, target.y); await page.mouse.click(target.x, target.y);
  await expect(page.getByRole('textbox', { name: 'Probe 3 name' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Probe 3 name' }).fill('Filter output');
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
  await expect(page.getByRole('textbox', { name: 'Probe 3 name' })).toHaveValue('Filter output');
  await expect(page.getByLabel('Capture duration in seconds')).toHaveValue('0.02');
  await expect(page.getByLabel('Capture target samples')).toHaveValue('4096');
});

test('grading is prepared from native electrical values and connectivity', async ({ page }) => {
  await page.goto('/problems/precision-voltage-divider'); await nativeEditor(page);
  await page.getByRole('button', { name: 'Prepare SPICE & grading', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'SPICE & grading' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Prepared from the current CircuitJS electrical graph and component values.', { exact: false })).toBeVisible();
  const gradeResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/grade' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Check fixed topology' }).click();
  const response = await gradeResponse;
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
  const probeNames = page.getByRole('textbox', { name: /^Probe \d+ name$/ });
  const probesBefore = await probeNames.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await page.locator('input[type="file"]').setInputFiles({ name: 'broken.xml', mimeType: 'application/xml', buffer: Buffer.from('<cir><broken') });
  await expect(page.getByRole('alert')).toContainText('well-formed CircuitJS XML');
  expect(await frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().length)).toBe(before);
  expect(await probeNames.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(probesBefore);
});

test('the supplied Sallen-Key SPICE model produces real Bode instruments', async ({ page }) => {
  await page.goto('/problems/sallen-key-q'); await nativeEditor(page);
  await page.getByRole('tab', { name: 'SPICE & grading' }).click();
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
  const downloadEvent = page.waitForEvent('download'); await exportButton.click();
  expect((await downloadEvent).suggestedFilename()).toBe('anacode-low-noise-sensor-divider.challenge.v1.json');
});

test('the native workspace is contained on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/problems/precision-voltage-divider'); await nativeEditor(page);
  await expect(page.locator('iframe[title="CircuitJS schematic editor"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/qa/editor-mobile.png', fullPage: true });
});
