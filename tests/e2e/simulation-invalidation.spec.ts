import { expect, test, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';

async function openDivider(page: Page) {
  await page.goto('/problems/precision-voltage-divider');
  const workspace = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(workspace.getByRole('button', { name: 'Capture all probes', exact: true })).toBeEnabled({ timeout: 45_000 });
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]').locator('body');
  return { workspace, native };
}

test('failed preparation remains visible after a fresh paused native graph is analyzed', async ({ page }) => {
  const { workspace, native } = await openDivider(page);
  const unsupported = CIRCUITJS_STARTERS['precision-voltage-divider'].replace('r 352 112 352 224 0 10000', 's 352 112 352 224 0 0 false');
  const importPaused = () => native.evaluate((_, text) => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    api.setSimRunning(false);
    api.importCircuit(text, false);
    return { running: api.isRunning(), switches: api.getElements().filter(element => element.getType() === 'SwitchElm').length };
  }, unsupported);

  expect(await importPaused()).toEqual({ running: false, switches: 1 });
  await workspace.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const conversionError = workspace.getByText('Switch is not supported by SPICE conversion yet. Use native live measurements for this component.', { exact: true });
  await expect(conversionError).toBeVisible();
  // A one-time visibility assertion can pass just before deferred invalidation
  // clears the diagnostic. Cross several native metadata publication turns.
  await page.waitForTimeout(500);
  await expect(conversionError).toBeVisible();
  await expect(workspace.locator('.result-footer')).toHaveCount(0);

  expect(await importPaused()).toEqual({ running: false, switches: 1 });
  await workspace.getByRole('button', { name: 'Check fixed topology', exact: true }).click();
  const grade = workspace.locator('.grade-card.failed');
  await expect(grade).toContainText('Switch is available for simulation but unsupported by this fixed-topology grader.');
  await page.waitForTimeout(500);
  await expect(grade).toContainText('Switch is available for simulation but unsupported by this fixed-topology grader.');
  await expect(workspace.getByRole('button', { name: 'Check fixed topology', exact: true })).toBeEnabled();
  expect(await native.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.isRunning())).toBe(false);
});

test('reset discards a delayed real grading response and permits a subsequent check', async ({ page }) => {
  const { workspace } = await openDivider(page);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  let reportServerResult!: (result: { status: number; passed: boolean }) => void;
  const serverResult = new Promise<{ status: number; passed: boolean }>(resolve => { reportServerResult = resolve; });
  await page.route('**/api/grade', async route => {
    // Exercise the real server's grader, delaying delivery only. No grade or
    // solver data is fabricated by this regression.
    const response = await route.fetch();
    const result = await response.json() as { passed: boolean };
    reportServerResult({ status: response.status(), passed: result.passed });
    await responseGate;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await workspace.getByRole('button', { name: 'Check fixed topology', exact: true }).click();
    expect(await serverResult).toEqual({ status: 200, passed: true });
    await expect(workspace.getByRole('button', { name: 'Checking…', exact: true })).toBeDisabled();
    await workspace.getByRole('button', { name: 'Reset simulation', exact: true }).click();
    await expect(workspace.getByRole('button', { name: 'Check fixed topology', exact: true })).toBeEnabled();
    await expect(workspace.locator('.grade-card')).toHaveCount(0);
    const delivered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/grade' && response.request().method() === 'POST');
    releaseResponse();
    await (await delivered).finished();
    await page.waitForTimeout(300);
    await expect(workspace.locator('.grade-card')).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: 'Check fixed topology', exact: true })).toBeEnabled();

    await workspace.getByRole('button', { name: 'Check fixed topology', exact: true }).click();
    await expect(workspace.locator('.grade-card.passed')).toContainText('Fixed-topology check passed', { timeout: 20_000 });
  } finally {
    releaseResponse();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
