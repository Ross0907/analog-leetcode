import { expect, test } from "@playwright/test";

test("parts-only practice cannot simulate or submit an unwired reference solution", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const slug of ["wire-adc-reference", "wire-antialias-filter"]) {
    await page.goto(`/problems/${slug}`);
    const workspace = page.getByRole("region", { name: "CircuitJS schematic and simulation workspace", exact: true });
    await expect(workspace.locator('p[role="status"]')).toContainText("Editor ready", { timeout: 45_000 });
    await workspace.getByText("Wiring guide", { exact: true }).click();
    await expect(workspace.getByText(/ground symbols|source −/).first()).toBeVisible();
    await workspace.getByRole("button", { name: "SPICE & grading", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "Oscilloscope & FFT", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "SPICE analysis source", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Run simulation", exact: true }).click();
    await expect(page.locator(".simulation-message.error")).toContainText(/wire|not connected|output junction/i);
    await expect(page.locator(".result-footer")).toHaveCount(0);
    await page.getByRole("button", { name: "Check fixed topology", exact: true }).click();
    await expect(page.locator(".grade-card.failed")).toContainText(/wire|not connected|output junction/i);
    await expect(page.locator(".grade-card.passed")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("converter lesson connects its block explanation to named comparator probes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/problems/flash-adc-thermometer");
  const workspace = page.getByRole("region", { name: "CircuitJS schematic and simulation workspace", exact: true });
  await expect(workspace.locator('p[role="status"]')).toContainText("Editor ready", { timeout: 45_000 });
  const blocks = page.getByRole("figure", { name: "Parallel conversion" });
  await expect(blocks).toBeVisible();
  await expect(blocks.getByText("Encoder", { exact: true })).toBeVisible();
  await expect(blocks.getByRole("list", { name: "Signal connections" }).getByRole("listitem")).toHaveCount(3);
  await workspace.getByRole("button", { name: "Oscilloscope & FFT", exact: true }).click();
  await workspace.locator("details > summary").filter({ hasText: "Probes & capture settings" }).click();
  for (const label of ["V(vin)", "V(t1)", "V(t2)", "V(t3)"]) await expect(workspace.getByRole("checkbox", { name: `Enable ${label}`, exact: true })).toBeChecked();
  await page.setViewportSize({ width: 600, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(601);
  await blocks.screenshot({ path: ".tmp/converter-blocks.png" });
  expect(errors).toEqual([]);
});
