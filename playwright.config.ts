import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Local-only secrets for the specs (never committed; see .env.e2e.example).
// Variables already set in the shell win.
const e2eEnvFile = join(process.cwd(), ".env.e2e");
if (existsSync(e2eEnvFile)) process.loadEnvFile(e2eEnvFile);

function resolveBaseUrl(): string {
  const url =
    process.env.E2E_BASE_URL ||
    process.env.E2E_WEB_URL ||
    process.env.FRONTEND_URL;
  if (!url) {
    throw new Error(
      "E2E target URL is required. Set E2E_BASE_URL, E2E_WEB_URL, or FRONTEND_URL (e.g. in .env.e2e)."
    );
  }
  return url;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"]],

  use: {
    baseURL: resolveBaseUrl(),
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
