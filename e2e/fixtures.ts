import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import crypto from "crypto";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "APIWLsbggsQnKdN";
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || "juXmqj30DR0SRmcF3xfeLp6EilDxrUdtesUgWaNebZJB";

export const TEST_USERS = {
  coach: { email: "coach@nexa.test", password: "Test@12345" },
  student: { email: "student@nexa.test", password: "Test@12345" },
  admin: { email: "superadmin@nexa.test", password: "Test@12345" },
} as const;

export type TestRole = keyof typeof TEST_USERS;

/**
 * Builds the `Authorization` JWT LiveKit sends alongside a webhook. The `sha256`
 * claim must be **base64** — `livekit-server-sdk`'s `WebhookReceiver` compares it
 * against `createHash("sha256").digest("base64")`, so a hex digest here is
 * rejected by the API.
 */
export function createWebhookSignature(body: string | Record<string, unknown>): string {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const sha256 = crypto.createHash("sha256").update(rawBody).digest("base64");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: LIVEKIT_API_KEY,
      sub: LIVEKIT_API_KEY,
      sha256,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", LIVEKIT_API_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * POSTs a LiveKit webhook exactly the way LiveKit does: the signed bytes sent
 * verbatim as `application/webhook+json`, which `main.ts` keeps as raw text for
 * signature verification. Serialising the object again on the API side would
 * change key order and break the digest.
 */
export async function sendLiveKitWebhook(
  request: APIRequestContext,
  event: Record<string, unknown>
) {
  const body = JSON.stringify(event);
  return request.post(`${API_URL}/webhooks/livekit`, {
    data: body,
    headers: {
      "Content-Type": "application/webhook+json",
      Authorization: createWebhookSignature(body),
    },
  });
}

/**
 * Logs in through the API using the browser context's own request object, so the
 * session cookies land in the context and every page opened from it is
 * authenticated — no manual cookie copying, which silently drops `Secure`/domain
 * attributes.
 *
 * `/auth/login` is throttled at 5 requests per minute per IP, so a suite that
 * logs several roles in (plus a retry) will hit 429. Back off and retry rather
 * than failing the run on rate limiting.
 */
export async function loginContext(
  context: BrowserContext,
  role: TestRole
): Promise<void> {
  const { email, password } = TEST_USERS[role];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await context.request.post(`${API_URL}/auth/login`, {
      data: { email, password },
    });
    if (res.ok()) return;
    if (res.status() !== 429) {
      throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
    }
    // Throttler window is 60s; wait it out rather than hammering.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }

  throw new Error(`Login for ${email} kept hitting the rate limiter.`);
}

/**
 * Login via the actual UI (navigates to /login, fills form, submits).
 * Returns after the auth cookie is set and the page redirects.
 */
export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
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
  body?: Record<string, unknown>
) {
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { data: body } : {}),
  });
  return res;
}

/** `apiCall` that fails the test with the response body when the call errors. */
export async function apiCallOk(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>
) {
  const res = await apiCall(request, method, path, body);
  expect(res.ok(), `${method} ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy();
  return res;
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
