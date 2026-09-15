import { expect, test } from "@playwright/test";

test("problem panel modes persist and a worked answer updates searchable progress", async ({ page }) => {
  await page.goto("/problems/loaded-divider");
  await expect(page.locator('p[role="status"]')).toContainText("Editor ready", { timeout: 40_000 });
  await page.getByRole("button", { name: "Compact description", exact: true }).click();
  await expect(page.locator(".challenge-workspace")).toHaveAttribute("data-problem-mode", "compact");
  await page.getByRole("button", { name: "Hide description", exact: true }).click();
  await expect(page.locator("#problem-description-pane")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide description", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#problem-description-pane")).toBeHidden();
  await page.getByRole("button", { name: "Expand description", exact: true }).click();
  await page.getByRole("textbox", { name: "Loaded output (V)", exact: true }).fill("2.5");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".practice-answer")).toContainText("outside the accepted tolerance");
  await page.getByRole("textbox", { name: "Loaded output (V)", exact: true }).fill("1.6667");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".practice-answer")).toContainText("Correct.");
  await page.locator(".practice-answer summary").click();
  await expect(page.locator(".practice-answer details")).toContainText("5 kΩ");
  await page.goto("/problems");
  await expect(page.getByText("1 / 24 completed", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Solved", exact: true }).check();
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await expect(page.locator(".catalog-row")).toContainText("A voltmeter that loads the divider");
  await page.getByRole("button", { name: "Random problem", exact: true }).click();
  await expect(page).toHaveURL(/\/problems\/loaded-divider$/);
});

test("collapsed description leaves a usable schematic viewport on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/problems/noninverting-feedback");
  await expect(page.locator('p[role="status"]')).toContainText("Editor ready", { timeout: 40_000 });
  await page.getByRole("button", { name: "Hide description", exact: true }).click();
  await expect(page.locator("#problem-description-pane")).toBeHidden();
  const frame = page.getByTitle("CircuitJS schematic editor", { exact: true });
  await expect(frame).toBeVisible();
  const bounds = await frame.boundingBox();
  expect(bounds!.width).toBeGreaterThan(400);
  expect(bounds!.height).toBeGreaterThan(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(601);
});
