import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.ANACODE_E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("ANACODE_E2E_PORT must be a valid local port.");
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  snapshotPathTemplate: "{testDir}/visual-baselines/{arg}{ext}",
  timeout: 75_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.ANACODE_E2E_EXTERNAL_SERVER === "1" ? undefined : {
    command: "node scripts/start-e2e-server.mjs",
    url: `${baseURL}/circuitjs/circuitjs.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
});
