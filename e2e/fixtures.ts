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

export function resolveWebUrl(): string {
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

/** Origin the API's CSRF check expects on writes (same resolution as playwright.config.ts). */
export const WEB_URL = resolveWebUrl();

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
  // Keep the cookie's own Domain, as a browser does: on split hosts (staging's
  // dev. + api-dev.) the API sets `Domain=.nexachess.in` so the web's middleware
  // sees the session too. Host-only cookies (localhost, academy hosts) stay on
  // the API's host.
  const apiHost = new URL(API_URL).hostname;
  return res
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value.split(";").map((part) => part.trim()))
    .filter(([pair]) => pair.startsWith("nexa_"))
    .map(([pair, ...attributes]) => {
      const eq = pair.indexOf("=");
      const domainAttribute = attributes.find((a) => /^domain=/i.test(a));
      const domain = domainAttribute ? domainAttribute.slice("domain=".length) : apiHost;
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

  // Same back-off as `loginContext`: /auth/login allows 5 a minute per IP and a
  // full run logs in far more often than that.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/auth/login") && res.request().method() === "POST"),
      page.getByRole("button", { name: /sign in|log in|login/i }).click(),
    ]);
    if (response.status() !== 429) break;
    await page.waitForTimeout(20_000);
  }

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
 * comes from a CLASS_EXTRA approval request the coach files and an admin
 * approves. `startsAt` must still be in the future when the approval runs.
 */
export async function scheduleClass(
  asCoach: CallAs,
  asAdmin: CallAs,
  body: { batchId: string; topic: string; startsAt: string; endsAt: string }
): Promise<string> {
  // Every spec books the same coach at about "now", so a class an earlier spec
  // (or an aborted run) left behind would 409 this one's approval.
  await clearE2EClasses(asCoach, asAdmin);
  const created = await asCoach("POST", "/approvals", {
    actionType: "CLASS_EXTRA",
    payload: body,
    reason: "E2E test class",
  });
  expect(created.ok(), `class request: ${await created.text()}`).toBeTruthy();
  const requestId: string = (await created.json()).request.id;

  const approved = await asAdmin("POST", `/admin/approvals/${requestId}/approve`, {});
  expect(approved.ok(), `approve class request: ${await approved.text()}`).toBeTruthy();
  const classId: string | null = (await approved.json()).request.classId;
  expect(classId, "approved request has no class").toBeTruthy();
  return classId as string;
}

/**
 * Ends or cancels the coach's leftover E2E classes (topic contains "E2E"). A
 * coach cancels directly only more than 24 h ahead (V10), so a nearer class is
 * cancelled the real way: the coach files CLASS_CANCEL (CLASS_CANCEL_EXCEPTIONAL
 * once its start has passed) and the admin approves it.
 */
export async function clearE2EClasses(asCoach: CallAs, asAdmin: CallAs): Promise<void> {
  const seen = new Set<string>();
  for (const path of ["/coach/classes/upcoming", "/coach/classes"]) {
    const res = await asCoach("GET", path);
    if (!res.ok()) continue;
    const data = await res.json();
    const list: Array<{ id: string; topic?: string; status?: string; startsAt?: string }> = Array.isArray(data?.classes)
      ? data.classes
      : Array.isArray(data)
        ? data
        : [];
    for (const c of list) {
      if (seen.has(c.id) || !/E2E/i.test(c.topic || "")) continue;
      seen.add(c.id);
      if (c.status === "LIVE" || c.status === "IN_PROGRESS") {
        await asCoach("POST", `/live-class/${c.id}/end`).catch(() => undefined);
        continue;
      }
      if (c.status !== "SCHEDULED") continue;
      const direct = await asCoach("PATCH", `/coach/classes/${c.id}/cancel`);
      if (direct.ok()) continue;
      const started = c.startsAt ? Date.parse(c.startsAt) <= Date.now() : false;
      const filed = await asCoach("POST", "/approvals", {
        actionType: started ? "CLASS_CANCEL_EXCEPTIONAL" : "CLASS_CANCEL",
        payload: { classId: c.id },
        reason: "E2E cleanup of a leftover test class"
      });
      if (!filed.ok()) continue; // e.g. a cancellation already pending
      const requestId: string = (await filed.json()).request.id;
      await asAdmin("POST", `/admin/approvals/${requestId}/approve`, {});
    }
  }
}

/**
 * Locate a row by text in a client-paginated DataTable, walking pages with the
 * "Next" button. The shared dev DB carries hundreds of leftover E2E classes, so
 * a freshly-created one is rarely on page 1 of a date-sorted history list.
 * Matches a pager labelled "Next" or "Next page".
 */
export async function findInDataTable(page: Page, text: string, maxPages = 15) {
  const firstRow = page.locator("tbody tr").first();
  for (let i = 0; i < maxPages; i += 1) {
    await firstRow.waitFor({ state: "visible" });
    const cell = page.getByText(text).first();
    if (await cell.isVisible().catch(() => false)) return cell;
    const next = page.getByRole("button", { name: /^next( page)?$/i });
    if (!(await next.isEnabled().catch(() => false))) break;
    const before = await firstRow.innerText();
    await next.click();
    await expect.poll(() => firstRow.innerText()).not.toBe(before);
  }
  return page.getByText(text).first();
}

/**
 * Opens a live-room tab by name. Room tab rows show a few tabs and put the
 * rest under a "More views" menu (`RoomTabs maxVisible`), so a tab may be a
 * menu item instead.
 */
export async function openRoomTab(page: Page, name: string | RegExp, timeout = 15_000) {
  const tab = page.getByRole("tab", { name }).first();
  if (await tab.isVisible()) {
    await tab.click({ timeout });
    return;
  }
  const more = page.getByRole("button", { name: /^More views/ }).first();
  await more.click({ timeout });
  await page.getByRole("menuitem", { name }).first().click({ timeout });
}

export { API_URL };
