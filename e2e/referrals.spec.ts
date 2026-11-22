/**
 * Referrals end to end in the browser (docs/REFERRALS.md), driven as people do:
 * an admin creates a SALES account from Admin → Users, the sales person signs
 * in to their board (and nothing on their pages is refused), a visitor opens
 * their link and signs up, an admin moves the referral to a paying stage, the
 * sales person withdraws from the wallet, the admin pays it, and the decision
 * reaches the sales account's notification bell.
 *
 * Writes real rows on the target (a sales account, a student sign-up, a
 * reward, a withdrawal), so it is opt-in: RUN_REFERRAL_E2E=1. It changes the
 * "Onboarded" stage's sales value and the withdrawal settings for the run and
 * puts them back afterwards; the two accounts it made are moved to Trash.
 *
 * Needs E2E_BASE_URL + NEXT_PUBLIC_API_URL (.env.e2e) and the seeded admin.
 * Run: RUN_REFERRAL_E2E=1 npx playwright test e2e/referrals.spec.ts --project=chromium
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type {
  AdminReferralDetail,
  MyReferralSummary,
  NotificationListResponse,
  ReferralItem,
  ReferralPage,
  ReferralSettingsItem,
  ReferralStageItem,
  ReferralWithdrawalItem
} from "@nexa-chess/types";
import { api, API_URL, login, loginViaUI, WEB_URL, type Cookie } from "./fixtures";

test.skip(process.env.RUN_REFERRAL_E2E !== "1", "Writes referral rows on the target: set RUN_REFERRAL_E2E=1.");
// Serial, and no retries: a retry would repeat real writes with a new stamp.
test.describe.configure({ mode: "serial", retries: 0 });
test.use({ viewport: { height: 900, width: 1280 } });

const stamp = Date.now().toString(36);
const sales = { email: `e2e.sales.${stamp}@example.com`, first: "Sana", password: "Sales@12345" };
const visitor = { email: `e2e.ref.${stamp}@example.com`, name: `Ravi Ref${stamp}` };
const PAYING_STAGE = "refstage_converted";
const SALES_CASH = 5000;

let adminCookies: Cookie[];
let salesCookies: Cookie[];
let code = "";
let referralId = "";
let originalStage: Pick<ReferralStageItem, "salesCashMinor"> | null = null;
let originalSettings: Pick<ReferralSettingsItem, "minWithdrawalMinor" | "withdrawalRoles"> | null = null;
const createdUserIds: string[] = [];

async function asAdmin<T>(request: APIRequestContext, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(request, method, path, adminCookies, body);
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function asSales<T>(request: APIRequestContext, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(request, method, path, salesCookies, body);
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Every API answer of 400 or more the page gets, as "STATUS METHOD /path". */
function refusedRequests(page: Page) {
  const refused: string[] = [];
  page.on("response", (res) => {
    const path = new URL(res.url()).pathname;
    // The 5-a-minute login throttle is retried by loginViaUI; it is not a refusal.
    if (res.status() === 429 && path === "/auth/login") return;
    if (res.url().startsWith(API_URL) && res.status() >= 400) {
      refused.push(`${res.status()} ${res.request().method()} ${path}`);
    }
  });
  return refused;
}

test.beforeAll(async ({ request }) => {
  adminCookies = await login(request, "admin");
});

test.afterAll(async ({ request }) => {
  if (!adminCookies) return;
  if (originalStage) {
    await api(request, "PATCH", `/admin/referrals/stages/${PAYING_STAGE}`, adminCookies, originalStage);
  }
  if (originalSettings) {
    await api(request, "PUT", "/admin/referrals/settings", adminCookies, originalSettings);
  }
  for (const id of createdUserIds) {
    await api(request, "DELETE", `/users/${id}`, adminCookies);
  }
});

test("an admin creates a sales account from Admin → Users", async ({ browser, request }) => {
  const context = await browser.newContext();
  await context.addCookies(adminCookies);
  const page = await context.newPage();
  await page.goto("/admin/users");
  await page.getByRole("tab", { name: /Create/ }).click();
  await page.getByLabel("First Name").fill(sales.first);
  await page.getByLabel("Last Name").fill("E2E");
  await page.getByLabel("Email").fill(sales.email);
  await page.getByLabel(/^Password/).fill(sales.password);
  await page.getByLabel("Role").selectOption("SALES");
  await page.getByLabel("Status").selectOption("ACTIVE");
  await page.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByText(`"${sales.first}" created`)).toBeVisible();
  await context.close();

  salesCookies = await login(request, { email: sales.email, password: sales.password });
  const me = await asSales<{ user: { id: string; role: string } }>(request, "GET", "/auth/me");
  expect(me.user.role).toBe("SALES");
  createdUserIds.push(me.user.id);
});

test("the sales person signs in to their board and nothing on their pages is refused", async ({ browser, request }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const refused = refusedRequests(page);
  await loginViaUI(page, sales.email, sales.password);
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole("heading", { name: "Referral board" })).toBeVisible();
  code = (await asSales<MyReferralSummary>(request, "GET", "/referrals/me")).code ?? "";
  expect(code).toMatch(/^[A-Z0-9]{4,16}$/);
  await expect(page.getByText(code, { exact: true })).toBeVisible();

  // Profile: only the email kinds a sales account can be sent.
  await page.goto("/profile");
  await expect(page.getByText("Referrals", { exact: true })).toBeVisible();
  await expect(page.getByText("Homework and revision")).toHaveCount(0);
  // The bell and the heartbeat ran on both pages; let the last ones land.
  await page.waitForTimeout(3_000);
  expect(refused).toEqual([]);
  await context.close();
});

test("a visitor opens the link and signs up: the referral is tracked to the sales account", async ({ browser, request }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const visit = page.waitForResponse((res) => res.url().endsWith("/referrals/visit") && res.request().method() === "POST");
  await page.goto(`/r/${code}`);
  expect((await visit).status()).toBe(200);
  await expect(page.getByText(`${sales.first} invited you`)).toBeVisible();

  // Same browser (the referral cookie the visit set), so the sign-up is linked.
  const signup = await context.request.post(`${API_URL}/auth/register`, {
    data: {
      acceptedTerms: true,
      confirmPassword: "Test@12345",
      contactNumber: `9${String(Date.now()).slice(-9)}`,
      email: visitor.email,
      parentName: "E2E Parent",
      password: "Test@12345",
      studentAge: "9",
      studentName: visitor.name
    },
    headers: { Origin: WEB_URL }
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await context.close();

  const mine = await asSales<ReferralPage<ReferralItem>>(request, "GET", "/referrals/me/referrals");
  expect(mine.items).toHaveLength(1);
  expect(mine.items[0].visits).toBeGreaterThanOrEqual(1);
  referralId = mine.items[0].id;
  const linked = await asAdmin<AdminReferralDetail>(request, "GET", `/admin/referrals/${referralId}`);
  expect(linked.referredUser?.email ?? null).toBe(visitor.email);
  if (linked.referredUser?.id) createdUserIds.push(linked.referredUser.id);
});

test("a paying stage credits the sales wallet; they withdraw, the admin pays, the bell says so", async ({ browser, request }) => {
  test.setTimeout(240_000);
  // Make the "Onboarded" stage pay sales staff, and let SALES withdraw small sums, for this run.
  const stages = await asAdmin<ReferralStageItem[]>(request, "GET", "/admin/referrals/stages");
  const paying = stages.find((stage) => stage.id === PAYING_STAGE);
  expect(paying, "the default Onboarded stage").toBeTruthy();
  originalStage = { salesCashMinor: paying!.salesCashMinor };
  await asAdmin(request, "PATCH", `/admin/referrals/stages/${PAYING_STAGE}`, { salesCashMinor: SALES_CASH });
  const settings = await asAdmin<ReferralSettingsItem>(request, "GET", "/admin/referrals/settings");
  originalSettings = { minWithdrawalMinor: settings.minWithdrawalMinor, withdrawalRoles: settings.withdrawalRoles };
  await asAdmin(request, "PUT", "/admin/referrals/settings", {
    minWithdrawalMinor: 1000,
    withdrawalRoles: [...new Set([...settings.withdrawalRoles, "SALES"])]
  });

  const moved = await asAdmin<AdminReferralDetail>(request, "PATCH", `/admin/referrals/${referralId}/stage`, {
    note: "E2E onboarded",
    stageId: PAYING_STAGE
  });
  const reward = moved.rewards.find((item) => item.unit === "CASH");
  expect(reward, "a money reward for the sales account").toBeTruthy();
  if (reward!.status === "PENDING") {
    await asAdmin(request, "POST", `/admin/referrals/rewards/${reward!.id}/approve`);
  }
  expect((await asSales<MyReferralSummary>(request, "GET", "/referrals/me")).money?.balanceMinor).toBe(SALES_CASH);

  // The sales person withdraws from the Wallet tab.
  const context = await browser.newContext();
  await context.addCookies(salesCookies);
  const page = await context.newPage();
  const refused = refusedRequests(page);
  await page.goto("/sales");
  await page.getByRole("tab", { name: "Wallet" }).click();
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByLabel(/^Amount/).fill(String(SALES_CASH / 100));
  await page.getByLabel(/^Pay to/).fill("e2e-sales@upi");
  await page.getByRole("button", { name: "Request withdrawal" }).click();
  await expect(page.getByText("No withdrawals yet")).toHaveCount(0);

  const withdrawals = await asSales<ReferralWithdrawalItem[]>(request, "GET", "/referrals/me/withdrawals");
  const requested = withdrawals.find((item) => item.status === "REQUESTED");
  expect(requested?.amountMinor).toBe(SALES_CASH);
  await asAdmin(request, "POST", `/admin/referrals/withdrawals/${requested!.id}/pay`, { adminNote: "E2E paid", payoutReference: `E2E-${stamp}` });

  // The referral notices are in-app by default and must reach the sales account's
  // bell. They go through the delivery outbox, whose worker runs about once a minute.
  await expect
    .poll(async () => {
      const res = await api(request, "GET", "/notifications", salesCookies);
      if (!res.ok()) return [`HTTP ${res.status()}`];
      return ((await res.json()) as NotificationListResponse).notifications.map((item) => item.type).sort();
    }, { intervals: [5_000], timeout: 150_000 })
    .toEqual(["REFERRAL_PROGRESS", "REFERRAL_REQUEST_DECIDED", "REFERRAL_REWARD"]);
  expect(refused).toEqual([]);
  await context.close();
});
