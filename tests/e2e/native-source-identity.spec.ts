import { expect, test, type Page } from '@playwright/test';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';

type NativeTestWindow = Window & {
  CircuitJS1: CircuitJsApi;
  sourceIdentityFixture?: CircuitJsElement[];
};

// Deleting the first resistor shifts every source index without replacing any
// source. Three independent grounded supplies make unintended edits observable.
const fixture = `$ 4 0.000005 10.20027730826997 50 5 50 5e-11
r 96 96 160 96 0 1000
v 96 320 96 224 0 0 40 1 0 0 0.5
g 96 320 96 352 0
v 320 320 320 224 0 0 40 2 0 0 0.5
g 320 320 320 352 0
v 544 320 544 224 0 0 40 3 0 0 0.5
g 544 320 544 352 0`;

async function openSources(page: Page) {
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText(/Editor ready|Captured/, { timeout: 45_000 });
  await expect(workspace.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45_000 });
  await workspace.locator('input[type="file"]').setInputFiles({ name: 'source-identities.circuitjs.txt', mimeType: 'text/plain', buffer: Buffer.from(fixture) });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('body');
  await expect.poll(() => native.evaluate(() => (window as NativeTestWindow).CircuitJS1.getElements().filter(element => element.getType() === 'VoltageElm').length)).toBe(3);
  await native.evaluate(() => {
    const state = window as NativeTestWindow;
    state.CircuitJS1.setSimRunning(false);
    const error = state.CircuitJS1.ensureAnalyzed?.();
    if (error) throw new Error(error);
    state.CircuitJS1.cancelDrawing();
    state.sourceIdentityFixture = state.CircuitJS1.getElements().filter(element => element.getType() === 'VoltageElm');
  });
  const summary = workspace.locator('details > summary').filter({ hasText: 'Analysis, sources & models' });
  if (await summary.locator('..').getAttribute('open') === null) await summary.click();
  await expect(workspace.getByLabel('Waveform source', { exact: true }).locator('option')).toHaveCount(3);
  return { workspace, native };
}

async function deleteAt(page: Page, x: number, y: number) {
  const iframe = page.locator('iframe[title="CircuitJS schematic editor"]');
  await iframe.scrollIntoViewIfNeeded();
  const frameBounds = await iframe.boundingBox();
  if (!frameBounds) throw new Error('Native editor is not visible.');
  const point = await page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('body').evaluate((_, point) => {
    const api = (window as NativeTestWindow).CircuitJS1;
    const bounds = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: bounds.left + api.screenX(point.x), y: bounds.top + api.screenY(point.y) };
  }, { x, y });
  await page.mouse.click(frameBounds.x + point.x, frameBounds.y + point.y);
  await page.keyboard.press('Delete');
}

test('a paused source draft follows its native source when an earlier component is deleted', async ({ page }) => {
  const { workspace, native } = await openSources(page);
  const source = workspace.getByLabel('Waveform source', { exact: true });
  const waveform = workspace.getByLabel('Source waveform type', { exact: true });
  const level = workspace.getByLabel('DC level', { exact: true });
  await source.selectOption('3');
  await waveform.selectOption('dc');
  await level.fill('7.25');
  await workspace.getByRole('button', { name: 'Apply waveform', exact: true }).click();
  await expect.poll(() => native.evaluate(() => (window as NativeTestWindow).sourceIdentityFixture![1].getEditableValue()?.value)).toBe(7.25);
  await level.fill('8.5'); // Keep an unapplied draft while the graph changes.

  await deleteAt(page, 128, 96);
  await expect.poll(() => native.evaluate(() => (window as NativeTestWindow).CircuitJS1.getElements().length)).toBe(6);
  await expect(source).toHaveValue('2');
  await expect(waveform).toHaveValue('dc');
  await expect(level).toHaveValue('8.5');
  await workspace.getByRole('button', { name: 'Apply waveform', exact: true }).click();
  await expect.poll(() => native.evaluate(() => (window as NativeTestWindow).sourceIdentityFixture!.map(element => element.getEditableValue()?.value))).toEqual([1, 8.5, 3]);
  expect(await native.evaluate(() => {
    const state = window as NativeTestWindow;
    return { sameElement: state.CircuitJS1.getElements()[2] === state.sourceIdentityFixture![1], running: state.CircuitJS1.isRunning() };
  })).toEqual({ sameElement: true, running: false });
});

test('removing the selected source requires choosing a replacement instead of reusing its draft', async ({ page }) => {
  const { workspace, native } = await openSources(page);
  const source = workspace.getByLabel('Waveform source', { exact: true });
  await source.selectOption('3');
  await workspace.getByLabel('Source waveform type', { exact: true }).selectOption('dc');
  await workspace.getByLabel('DC level', { exact: true }).fill('9');
  await deleteAt(page, 320, 272);
  await expect.poll(() => native.evaluate(() => (window as NativeTestWindow).CircuitJS1.getElements().filter(element => element.getType() === 'VoltageElm').length)).toBe(2);
  await expect(source).toHaveValue('');
  await expect(workspace.getByText('The selected source was removed. Choose another source to edit.', { exact: true })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Apply waveform', exact: true })).toHaveCount(0);
  await source.selectOption('1');
  await expect(workspace.getByLabel('Source waveform type', { exact: true })).toHaveValue('native');
  await expect(workspace.getByLabel('DC level', { exact: true })).toHaveCount(0);
  expect(await native.evaluate(() => {
    const state = window as NativeTestWindow;
    return state.sourceIdentityFixture!.filter(element => state.CircuitJS1.getElements().includes(element)).map(element => element.getEditableValue()?.value);
  })).toEqual([1, 3]);
});

test('SPICE branch current and AC phase select their existing native probes without adding duplicates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/lab');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45_000 });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('body');
  const sourceIndex = await native.evaluate(() => (window as NativeTestWindow).CircuitJS1.getElements().findIndex(element => element.getType() === 'VoltageElm'));
  expect(sourceIndex).toBeGreaterThanOrEqual(0);
  const disclosure = workspace.locator('details > summary').filter({ hasText: 'Probes & capture settings' });
  if (await disclosure.locator('..').getAttribute('open') === null) await disclosure.click();
  await workspace.getByLabel('Component current probe', { exact: true }).selectOption(String(sourceIndex));
  await workspace.getByRole('button', { name: 'Add current', exact: true }).click();
  await workspace.getByLabel('Probe 3 name', { exact: true }).fill('Supply current');
  const probeNames = workspace.getByRole('textbox', { name: /^Probe \d+ name$/ });
  await expect(probeNames).toHaveCount(3);
  await workspace.getByLabel('Capture target samples', { exact: true }).selectOption('1024');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const currentScope = workspace.getByRole('region', { name: 'Oscilloscope · Current', exact: true });
  await expect(currentScope).toBeVisible({ timeout: 45_000 });
  await currentScope.getByRole('button', { name: /^Select I\(v1\)$/i }).click();
  await expect(workspace.getByRole('button', { name: 'Move probe 3 Supply current', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(probeNames).toHaveCount(3);

  await workspace.getByLabel('Schematic analysis type', { exact: true }).selectOption('ac-sweep');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const currentPhase = workspace.getByRole('region', { name: 'Bode phase', exact: true });
  await expect(currentPhase).toBeVisible({timeout:45000});
  await currentPhase.getByRole('button',{name:/^Select ∠I\(v1\)$/i}).click();
  await expect(workspace.getByRole('button',{name:'Move probe 3 Supply current',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(probeNames).toHaveCount(3);

  // A pure voltage AC run has two views of each electrical node. Selecting its
  // phase must reuse the same native voltage probe used by its magnitude.
  await workspace.getByRole('checkbox', { name: 'Enable Supply current', exact: true }).uncheck();
  await workspace.getByLabel('Schematic analysis type', { exact: true }).selectOption('ac-sweep');
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const phase = workspace.getByRole('region', { name: 'Bode phase', exact: true });
  await expect(phase).toBeVisible({ timeout: 45_000 });
  await phase.getByRole('button', { name: 'Select ∠V(vout)', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'Move probe 2 V(vout)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(probeNames).toHaveCount(3);
  await expect(workspace.getByRole('checkbox', { name: 'Enable Supply current', exact: true })).not.toBeChecked();
});
