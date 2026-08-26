import { test as base, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const TEST_USERS = {
  coach: { email: "coach@nexa.test", password: "Test@12345" },
  student: { email: "student@nexa.test", password: "Test@12345" },
  admin: { email: "superadmin@nexa.test", password: "Test@12345" },
} as const;

/**
 * Login via the actual UI (navigates to /login, fills form, submits).
 * Returns after the auth cookie is set and the page redirects.
 */
export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  // Wait for navigation away from login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

/**
 * Make an authenticated API request using the browser's cookies.
 * This is useful for operations that are hard to do via the UI
 * (e.g. creating classes, starting live sessions, sending webhooks).
 */
export async function apiCall(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  cookies?: Array<{ name: string; value: string; domain: string }>
) {
  const options: Record<string, unknown> = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.data = body;
  if (cookies) {
    (options as any).headers = {
      ...(options as any).headers,
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    };
  }
  const response = await request.fetch(`${API_URL}${path}`, options);
  return response;
}

/**
 * Get cookies from the browser context for a logged-in user.
 */
export async function getCookies(page: Page) {
  const context = page.context();
  const cookies = await context.cookies(API_URL);
  return cookies;
}

export { API_URL };
