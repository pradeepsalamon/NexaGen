/**
 * Form validation (docs/UI_RULES.md § "Form errors"): an error is a small message under the
 * field (FieldError) that never changes the form's height, an empty submit sends nothing,
 * fixing the input clears the message, and server errors are toasts with human text.
 *
 * Needs E2E_BASE_URL + NEXT_PUBLIC_API_URL (.env.e2e) and the seeded accounts.
 * Run: npx playwright test e2e/form-validation.spec.ts
 */
import { expect, request as playwrightRequest, test, type Locator, type Page } from "@playwright/test";
import { API_URL, login, type Cookie } from "./fixtures";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

let adminCookies: Cookie[] = [];

test.beforeAll(async () => {
  const context = await playwrightRequest.newContext();
  adminCookies = await login(context, "admin");
  await context.dispose();
});

async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((mode) => {
    window.localStorage.setItem("nexa-chess-theme", JSON.stringify({ mode, preference: mode }));
  }, theme);
}

const heightOf = (locator: Locator) =>
  locator.evaluate((element) => Math.round(element.getBoundingClientRect().height * 10) / 10);

/** Counts API calls whose URL ends with `path` (to prove a blocked submit sent nothing). */
function countRequests(page: Page, path: string) {
  const seen = { count: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.endsWith(path)) seen.count += 1;
  });
  return seen;
}

/** The field's message: visible, wired to the control by aria-describedby. */
async function expectFieldError(page: Page, fieldId: string, text: RegExp | string) {
  const message = page.locator(`#${fieldId}-error`);
  await expect(message).toBeVisible();
  await expect(message).toContainText(text);
  await expect(page.locator(`#${fieldId}`)).toHaveAttribute("aria-describedby", new RegExp(`${fieldId}-error`));
  await expect(page.locator(`#${fieldId}`)).toHaveAttribute("aria-invalid", "true");
}

for (const theme of THEMES) {
  for (const width of [1280, 390]) {
    test.describe(`forms (${theme}, ${width}px)`, () => {
      test.use({ viewport: { height: width === 390 ? 844 : 900, width } });

      test("login: empty and invalid email are blocked without moving the form", async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/login");
        const form = page.locator("form").first();
        await expect(form).toBeVisible({ timeout: 60_000 });
        const calls = countRequests(page, "/auth/login");
        const before = await heightOf(form);

        await page.getByRole("button", { exact: true, name: "Log in" }).click();
        await expectFieldError(page, "email", "Enter your email");
        await expectFieldError(page, "password", "Enter your password");
        await expect(page.locator("#email")).toBeFocused();
        expect(await heightOf(form)).toBe(before);

        await page.locator("#email").fill("not-an-email");
        await page.locator("#email").blur();
        await expectFieldError(page, "email", "Enter a valid email");
        expect(await heightOf(form)).toBe(before);
        await page.waitForTimeout(500);
        expect(calls.count).toBe(0);

        // Correcting the value clears its message as you type.
        await page.locator("#email").fill("superadmin@nexa.test");
        await expect(page.locator("#email-error")).toHaveCount(0);
        await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "false");
      });

      test("login: a wrong password is a toast with a human message", async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/login");
        const form = page.locator("form").first();
        await expect(form).toBeVisible({ timeout: 60_000 });
        const before = await heightOf(form);
        // An address with no account: the same 401, and no real account's failed-attempt
        // counter (10 locks it for 15 min) goes up.
        await page.locator("#email").fill("no-such-user-e2e@nexa.test");
        await page.locator("#password").fill("Wrong-password-1");
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST"),
          page.getByRole("button", { exact: true, name: "Log in" }).click()
        ]);
        test.skip(response.status() === 429, "login throttled (5/min); rerun later");
        expect(response.status()).toBe(401);
        const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Login failed" });
        await expect(toast).toBeVisible();
        await expect(toast).not.toContainText(/Exception|undefined|status code/i);
        expect(await heightOf(form)).toBe(before);
      });
    });
  }
}
