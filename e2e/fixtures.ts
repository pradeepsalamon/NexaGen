import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import crypto from "crypto";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
/**
 * No fallback: these must match the API's LiveKit key, and a committed default
 * is a committed secret. Set them in `.env.e2e` (see `.env.e2e.example`).
 */
function requireEnv(name: "LIVEKIT_API_KEY" | "LIVEKIT_API_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.e2e.example to .env.e2e and fill it in.`);
  }
  return value;
}

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
      iss: requireEnv("LIVEKIT_API_KEY"),
      sub: requireEnv("LIVEKIT_API_KEY"),
      sha256,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", requireEnv("LIVEKIT_API_SECRET"))
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

/** A session cookie as `context.addCookies` takes it. */
export type Cookie = { name: string; value: string; domain: string; path: string; httpOnly: boolean };

/** Origin the API's CSRF check expects on writes (same resolution as playwright.config.ts). */
export const WEB_URL =
  process.env.E2E_BASE_URL || process.env.E2E_WEB_URL || process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * Logs in through the API and returns the `nexa_*` session cookies, for specs
 * that juggle several users on one request context. Reads each Set-Cookie
 * header on its own (an `Expires=` date holds a comma) and splits at the first
 * `=` only (a value may contain one). Backs off on the 5/min login throttle.
 */
export async function login(request: APIRequestContext, role: TestRole | { email: string; password: string }): Promise<Cookie[]> {
  const credentials = typeof role === "string" ? TEST_USERS[role] : role;
  const send = () =>
    request.post(`${API_URL}/auth/login`, { data: credentials, headers: { Origin: WEB_URL } });
  let res = await send();
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await send();
  }
  expect(res.ok(), `login ${credentials.email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const domain = new URL(API_URL).hostname;
  return res
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value.split(";")[0].trim())
    .filter((pair) => pair.startsWith("nexa_"))
    .map((pair) => {
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain, path: "/", httpOnly: true };
    });
}

export function cookieHeader(cookies: Cookie[] | string): string {
  return typeof cookies === "string" ? cookies : cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** An API call as the user whose cookies are passed (from `login`). */
export function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: Cookie[] | string,
  body?: unknown
) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(cookies), Origin: WEB_URL },
    data: body,
  });
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

/** The seed's batch holding both coach@ and student@nexa.test (`apps/api/prisma/seed.ts`). */
export const E2E_BATCH_NAME = "Seeded Beginner Batch";

/**
 * The seeded batch's id from a `/coach/batches` body. That list is newest
 * first, so `[0]` is whatever batch the coach was added to last — often one
 * without the seeded student.
 */
export function seededBatchId(body: unknown): string {
  const list = (Array.isArray(body) ? body : (body as { batches?: unknown[] })?.batches) ?? [];
  const batch = (list as Array<{ id: string; name: string }>).find((b) => b.name === E2E_BATCH_NAME);
  if (!batch) {
    throw new Error(`coach@nexa.test has no "${E2E_BATCH_NAME}" batch; run npm run db:seed.`);
  }
  return batch.id;
}

type CallAs = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>
) => Promise<APIResponse>;

/**
 * Coaches can't create classes (they're academy-scheduled), so a spec's class
 * comes from an EXTRA_CLASS request the coach files and an admin approves.
 * `startsAt` must still be in the future when the approval runs.
 */
export async function scheduleClass(
  asCoach: CallAs,
  asAdmin: CallAs,
  body: { batchId: string; topic: string; startsAt: string; endsAt: string }
): Promise<string> {
  const created = await asCoach("POST", "/class-requests", {
    ...body,
    reason: "E2E test class",
    type: "EXTRA_CLASS",
  });
  expect(created.ok(), `class request: ${await created.text()}`).toBeTruthy();
  const requestId: string = (await created.json()).request.id;

  const approved = await asAdmin("POST", `/class-requests/${requestId}/approve`, {});
  expect(approved.ok(), `approve class request: ${await approved.text()}`).toBeTruthy();
  const classId: string | null = (await approved.json()).request.classId;
  expect(classId, "approved request has no class").toBeTruthy();
  return classId as string;
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
