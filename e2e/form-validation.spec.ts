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

// Layout height (`offsetHeight`), not the painted box: the login card grows in with a
// transform (scale 0.98 → 1), which would read as the form moving.
const heightOf = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement).offsetHeight);

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

      test("register: password rules and an empty select, all under their fields", async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/register");
        const form = page.locator("form").first();
        await expect(form).toBeVisible({ timeout: 60_000 });
        const calls = countRequests(page, "/auth/register");
        const before = await heightOf(form);

        await page.locator("#password").fill("short1");
        await page.locator("#password").blur();
        await expectFieldError(page, "password", "Use at least 8 characters");
        await page.locator("#password").fill("lettersonly");
        await expectFieldError(page, "password", "Use at least one letter and one number");
        await page.locator("#confirm-password").fill("different1");
        await page.locator("#confirm-password").blur();
        await expectFieldError(page, "confirm-password", "Passwords don't match");
        expect(await heightOf(form)).toBe(before);

        await page.getByRole("button", { name: "Complete registration" }).click();
        await expectFieldError(page, "acquisition-source", "Choose an option");
        await expectFieldError(page, "student-name", "Enter the student's name");
        await expect(page.locator("#student-name")).toBeFocused();
        expect(await heightOf(form)).toBe(before);

        // Fixed values clear their messages at once.
        await page.locator("#password").fill("letters123");
        await expect(page.locator("#password-error")).toHaveCount(0);
        await page.locator("#acquisition-source").selectOption({ index: 1 });
        await expect(page.locator("#acquisition-source-error")).toHaveCount(0);
        expect(calls.count).toBe(0);
      });

      test("coach register: the API's number limit is checked in the browser", async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/register");
        await page.getByRole("tab", { name: "Coach" }).click();
        const field = page.locator("#years-of-experience");
        await expect(field).toBeVisible({ timeout: 60_000 });
        await field.fill("99");
        await field.blur();
        await expectFieldError(page, "years-of-experience", "Enter up to 80 years");
        await field.fill("12");
        await expect(page.locator("#years-of-experience-error")).toHaveCount(0);
      });

      test("dialog: new sales account blocks an empty submit and shows a duplicate email as a toast", async ({ page }) => {
        await useTheme(page, theme);
        await page.context().addCookies(adminCookies);
        await page.goto("/admin/referrals?tab=referrers");
        await page.getByRole("button", { name: "New sales account" }).click({ timeout: 60_000 });
        const dialog = page.getByRole("dialog", { name: "New sales account" });
        await expect(dialog).toBeVisible();
        // Let the open animation (zoom-in) finish: its transform is in the measured box.
        await page.waitForTimeout(500);
        const calls = countRequests(page, "/users");
        const before = await heightOf(dialog);

        await dialog.getByRole("button", { name: /create/i }).click();
        await expectFieldError(page, "sales-first", "Enter a first name");
        expect(await heightOf(dialog)).toBe(before);
        await page.locator("#sales-first").fill("E2E");
        await dialog.getByRole("button", { name: /create/i }).click();
        await expectFieldError(page, "sales-email", "Enter a valid email");
        expect(await heightOf(dialog)).toBe(before);
        expect(calls.count).toBe(0);

        // A server refusal: an email that already has an account. Nothing is created.
        await page.locator("#sales-email").fill("superadmin@nexa.test");
        const [response] = await Promise.all([
          page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/users") && r.request().method() === "POST"),
          dialog.getByRole("button", { name: /create/i }).click()
        ]);
        expect(response.status()).toBeGreaterThanOrEqual(400);
        expect(response.status()).toBeLessThan(500);
        const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Could not create the account" });
        await expect(toast).toBeVisible();
        await expect(toast).not.toContainText(/Exception|undefined|status code/i);
        expect(await heightOf(dialog)).toBe(before);
      });

      test("edit: a batch loads, an empty name is blocked, and a valid save goes through", async ({ page }) => {
        // Phones list batches as cards; the 390 px checks are the login and dialog tests.
        test.skip(width === 390, "desktop table only");
        await useTheme(page, theme);
        await page.context().addCookies(adminCookies);
        await page.goto("/admin/batches");
        // Row actions are labelled "Edit <batch name>".
        const edit = page.locator("table").first().getByRole("button", { name: /^Edit / }).first();
        await edit.click({ timeout: 60_000 });
        const name = page.locator("#name");
        await expect(name).not.toHaveValue("", { timeout: 30_000 });
        const original = await name.inputValue();
        const form = page.locator("form").filter({ has: name });
        const before = await heightOf(form);
        const saves = { count: 0 };
        page.on("request", (r) => {
          if (r.method() === "PATCH" && /\/batches\//.test(new URL(r.url()).pathname)) saves.count += 1;
        });

        await name.fill("");
        await page.getByRole("button", { name: "Save Batch" }).click();
        await expectFieldError(page, "name", /required/i);
        expect(await heightOf(form)).toBe(before);
        await page.waitForTimeout(400);
        expect(saves.count).toBe(0);

        await name.fill(original);
        await expect(page.locator("#name-error")).toHaveCount(0);
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === "PATCH" && /\/batches\//.test(new URL(r.url()).pathname)),
          page.getByRole("button", { name: "Save Batch" }).click()
        ]);
        expect(response.ok()).toBeTruthy();
      });
    });
  }
}
