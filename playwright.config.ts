import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Local-only secrets for the specs (never committed; see .env.e2e.example).
// Variables already set in the shell win.
const e2eEnvFile = join(process.cwd(), ".env.e2e");
if (existsSync(e2eEnvFile)) process.loadEnvFile(e2eEnvFile);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"]],

  use: {
    /**
     * Overridable, and that is not a convenience.
     *
     * Production nexa_web listens on :3000 and nexa_api on :3001 on this host.
     * A hard-coded localhost:3000 means an automated run drives the PRODUCTION
     * app and signs in against the production database with the seeded
     * accounts. Point a throwaway dev stack's URL in via E2E_BASE_URL, which
     * takes priority here. E2E_WEB_URL/FRONTEND_URL (sourced from the deployment
     * `.env`) let you deliberately point the same specs at a real environment.
     */
    baseURL:
      process.env.E2E_BASE_URL ||
      process.env.E2E_WEB_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000",
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
