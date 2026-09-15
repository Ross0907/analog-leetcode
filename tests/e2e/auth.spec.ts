import { expect, test } from "@playwright/test";

test("account forms, recovery navigation, and unconfigured state are accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login?return_to=%2Flab");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  const unavailable = await page.getByText("Sign-in is not available yet.", { exact: true }).isVisible();
  if (unavailable) {
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeDisabled();
  } else {
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  }
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  // Cold development-server navigation can compile under the full CI build load.
  await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="return_to"]')).toHaveValue("/lab");
  await page.getByRole("link", { name: "Back to sign in", exact: true }).click();
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("client identity headers cannot unlock a profile and cross-site sign-in is rejected", async ({ request }) => {
  const profile = await request.get("/profile", { maxRedirects: 0, headers: {
    "oai-authenticated-user-id": "forged-user",
    "oai-authenticated-user-email": "forged@example.com",
    "oai-authenticated-user-full-name": "Forged User",
  } });
  expect([302, 303, 307, 308]).toContain(profile.status());
  expect(profile.headers().location).toMatch(/\/login\?return_to=%2Fprofile/);
  const progress = await request.get("/api/progress", { headers: {
    "oai-authenticated-user-id": "forged-user",
    "oai-authenticated-user-email": "forged@example.com",
  } });
  expect(progress.status()).toBe(200);
  expect(progress.headers()["cache-control"]).toContain("no-store");
  expect(await progress.json()).toEqual({ authenticated: false, available: true, solvedSlugs: [] });
  const write = await request.post("/auth/actions/signin", {
    headers: { origin: "https://untrusted.example", "sec-fetch-site": "cross-site" },
    form: { email: "engineer@example.com", password: "not submitted to Supabase" },
  });
  expect(write.status()).toBe(403);
});

test("invalid callback and password reset without a session show recovery paths", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&return_to=https%3A%2F%2Funtrusted.example");
  await expect(page).toHaveURL(/\/login\?.*error=callback/);
  await expect(page.getByRole("alert")).toContainText("could not be verified");
  await page.goto("/auth/update-password");
  await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new reset link", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save new password", exact: true })).toHaveCount(0);
  const malformed = await page.goto("/login?error=__proto__&message=constructor");
  expect(malformed?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
});
