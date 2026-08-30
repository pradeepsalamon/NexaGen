import type { Page } from "@playwright/test";

export const USERS = {
  admin: { email: "superadmin@nexa.test", password: "Test@12345" },
  coach: { email: "coach@nexa.test", password: "Test@12345" },
  student: { email: "student@nexa.test", password: "Test@12345" },
};

/**
 * Log in via the UI. The API throttles login to 5/min per IP, so when several
 * tests run back-to-back we retry with a backoff rather than failing outright.
 */
export async function login(page: Page, email: string, password: string) {
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|login/i }).first().click();
    try {
      await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
      return;
    } catch {
      // throttled or transient; wait and retry
      await page.waitForTimeout(12_000);
    }
  }
  throw new Error(`login failed for ${email} after ${maxAttempts} attempts`);
}
