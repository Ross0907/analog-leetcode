import { expect, test } from '@playwright/test';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { neutralCircuitJsPresentation } from '../../lib/circuitjs';

// Exercise actual KiCad SVGs on the upstream CircuitJS editor and terminal graph.
// A small pixel tolerance accommodates Chromium font rasterization on Windows/Linux.
for (const slug of ['rc-cutoff-1khz', 'cmos-inverter-trip-point', 'sallen-key-q']) {
 for (const theme of ['light', 'dark'] as const) {
  test(`native schematic visual regression: ${slug} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 660 });
    await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050');
    await page.waitForFunction(() => Boolean((window as unknown as { CircuitJS1?: CircuitJsApi }).CircuitJS1));
    await page.waitForFunction(() => Boolean((window as unknown as { AnaCodeKiCad?: {ready: boolean} }).AnaCodeKiCad?.ready));
    await page.evaluate(({document, theme}) => {
      const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
      api.setSimRunning(false);
      api.importCircuit(document, false);
      api.setTheme(theme);
    }, {document: neutralCircuitJsPresentation(CIRCUITJS_STARTERS[slug]), theme});
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveScreenshot(`${slug}-${theme}.png`, { animations: 'disabled', maxDiffPixelRatio: 0.015, threshold: 0.2 });
  });
 }
}
