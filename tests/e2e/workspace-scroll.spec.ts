import { expect, test, type Frame, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

async function editor(page: Page): Promise<Frame> {
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeEnabled({ timeout: 30_000 });
  const frame = await (await page.locator('iframe[title="CircuitJS schematic editor"]').elementHandle())?.contentFrame();
  if (!frame) throw new Error('The native schematic is missing.');
  return frame;
}

test('native schematic is neutral while electrical readings and imported components remain live', async ({ page }) => {
  await page.goto('/problems/precision-voltage-divider');
  const frame = await editor(page);
  const state = () => frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    const document = new DOMParser().parseFromString(api.exportCircuit(), 'application/xml');
    return {
      displayFlags: Number(document.documentElement.getAttribute('f')) & 13,
      resistors: api.getElements().filter((element) => element.getType() === 'ResistorElm').length,
      maximumVoltage: Math.max(...api.getElements().flatMap((element) => Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)))),
    };
  });
  await expect.poll(state).toMatchObject({ displayFlags: 4, resistors: 2, maximumVoltage: 5 });
  const coloredImport = await frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    const document = new DOMParser().parseFromString(api.exportCircuit(), 'application/xml');
    document.documentElement.setAttribute('f', '1');
    return new XMLSerializer().serializeToString(document);
  });
  await page.locator('input[type="file"]').setInputFiles({ name: 'native.xml', mimeType: 'application/xml', buffer: Buffer.from(coloredImport) });
  await expect.poll(state).toMatchObject({ displayFlags: 4, resistors: 2, maximumVoltage: 5 });
  await page.screenshot({ path: 'artifacts/qa/neutral-schematic-desktop.png', fullPage: true });
});

test('plain wheel over the native canvas scrolls the workbench and modified wheel still zooms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/problems/precision-voltage-divider');
  const frame = await editor(page);
  const panel = page.locator('.challenge-schematic-panel');
  expect(await panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const scale = () => frame.evaluate(() => {
    const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
    return api.screenX(100) - api.screenX(0);
  });
  const originalScale = await scale();
  const components = () => frame.evaluate(() => (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1.getElements().filter((element) => element.getType() === 'ResistorElm').map((element) => element.exportElement()));
  const originalComponents = await components();
  const canvas = frame.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Native canvas is not visible.');
  await page.mouse.move(bounds.x + bounds.width / 2, Math.min(bounds.y + bounds.height / 2, 750));
  await page.mouse.wheel(0, 300);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect(await scale()).toBe(originalScale);
  expect(await components()).toEqual(originalComponents);
  await panel.evaluate((element) => { element.scrollTop = 0; });
  await page.mouse.move(bounds.x + bounds.width / 2, Math.min(bounds.y + bounds.height / 2, 750));
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(scale).not.toBe(originalScale);
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeInViewport();
});

test('a narrow challenge page scrolls naturally over the embedded canvas to its capture controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/problems/precision-voltage-divider');
  const frame = await editor(page);
  expect(await page.locator('.brief-scroll').evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const canvas = frame.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Native canvas is not visible.');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(bounds.x + bounds.width / 2, Math.min(bounds.y + bounds.height / 2, 740));
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 50);
  await page.getByRole('button', { name: 'Capture all probes' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/qa/workspace-scroll-mobile.png', fullPage: true });
});
