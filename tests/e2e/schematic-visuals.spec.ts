import { expect, test } from '@playwright/test';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import type { CircuitJsApi } from '../../lib/circuitjs';

// Exercise the upstream renderer, rather than recreating symbol geometry in tests.
// A small pixel tolerance accommodates Chromium font rasterization on Windows/Linux.
for (const slug of ['rc-cutoff-1khz', 'cmos-inverter-trip-point', 'sallen-key-q']) {
  test(`native schematic visual regression: ${slug}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 660 });
    await page.goto('/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050');
    await page.waitForFunction(() => Boolean((window as unknown as { CircuitJS1?: CircuitJsApi }).CircuitJS1));
    await page.evaluate((document) => {
      const api = (window as unknown as { CircuitJS1: CircuitJsApi }).CircuitJS1;
      api.setSimRunning(false);
      api.importCircuit(document, false);
    }, CIRCUITJS_STARTERS[slug]);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveScreenshot(`${slug}.png`, { animations: 'disabled', maxDiffPixelRatio: 0.015, threshold: 0.2 });
  });
}
