import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"]],

  use: {
    // Defaults to a local dev server; sourcing the deployment `.env` (which sets
    // FRONTEND_URL/NEXT_PUBLIC_API_URL) points the suite at that environment
    // instead, so the same specs can be run against production.
    baseURL:
      process.env.E2E_WEB_URL || process.env.FRONTEND_URL || "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
