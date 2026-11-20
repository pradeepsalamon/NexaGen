/**
 * The forms the 2026-11-17 audit (docs/FORM_VALIDATION_AUDIT.md) marked "read only" and most
 * worth a click: class request, deploy assignment, voucher, referral stage editor, withdrawal,
 * refund and credit note. Each test checks what the form refuses in the browser (message under
 * the field per UI_RULES § "Form errors", or a disabled submit) and that a refused submit sends
 * nothing.
 *
 * Safe on staging:
 * - Class request: a valid request is sent, then taken back with the toast's Undo.
 * - Voucher and stage: created switched off / with no rewards, then deleted in the same test.
 * - Deploy assignment: never submitted (it would reach every student in the batch).
 * - Withdrawal, refund, credit note: money. The list the dialog opens from is stubbed with one
 *   made-up row (staging has none, and real financial records can't be deleted), and every write
 *   to their routes is blocked in the browser, so nothing reaches the API.
 *
 * Needs E2E_BASE_URL + NEXT_PUBLIC_API_URL (.env.e2e) and the seeded accounts.
 * Run: npx playwright test e2e/risky-forms.spec.ts
 */
import { expect, test, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import type { InvoiceItem, PaymentListItem, ReferralWithdrawalItem } from "@nexa-chess/types";
import { api, API_URL, clearE2EClasses, login, type Cookie, type TestRole } from "./fixtures";

test.use({ viewport: { height: 900, width: 1280 } });

const cookies: Partial<Record<TestRole, Cookie[]>> = {};

async function signedIn(context: BrowserContext, role: TestRole): Promise<Page> {
  if (!cookies[role]) {
    const request = context.request;
    cookies[role] = await login(request, role);
  }
  await context.addCookies(cookies[role]!);
  return context.newPage();
}

/** Writes (non-GET) the page sends to an API path matching `pattern`. */
function countWrites(page: Page, pattern: RegExp) {
  const seen = { count: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET" && pattern.test(new URL(request.url()).pathname)) seen.count += 1;
  });
  return seen;
}

/** Blocks every write to an API path matching `pattern` and counts the attempts. */
async function blockWrites(page: Page, pattern: RegExp) {
  const blocked = { count: 0 };
  await page.route(
    (url) => url.href.startsWith(API_URL) && pattern.test(url.pathname),
    async (route: Route) => {
      if (route.request().method() === "GET") return route.fallback();
      blocked.count += 1;
      await route.abort();
    },
  );
  return blocked;
}

/** Answers GET `path` (exact pathname) with `body`. */
async function stubGet(page: Page, path: string, body: unknown) {
  await page.route(
    (url) => url.href.startsWith(API_URL) && url.pathname === path,
    async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
    },
  );
}

/** The field's message: visible and wired to the control (FieldError + aria-describedby). */
async function expectFieldError(page: Page, fieldId: string, text: RegExp | string) {
  const message = page.locator(`#${fieldId}-error`);
  await expect(message).toBeVisible();
  await expect(message).toContainText(text);
  await expect(page.locator(`#${fieldId}`)).toHaveAttribute("aria-describedby", new RegExp(`${fieldId}-error`));
}

/** A row action: an inline icon button, or an item under the row's "More actions" menu. */
async function rowAction(page: Page, row: Locator, name: string) {
  const inline = row.getByRole("button", { exact: true, name });
  if (await inline.isVisible().catch(() => false)) return inline.click();
  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { exact: true, name }).click();
}

const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, "");

test.describe("risky forms", () => {
  test("class request: a short reason is refused under the field; a valid request is sent and undone", async ({ context, playwright }) => {
    const request = await playwright.request.newContext();
    const coach = await login(request, "coach");
    const admin = await login(request, "admin");
    // A leftover E2E class at "next hour" would make the request a conflict.
    await clearE2EClasses(
      (method, path, body) => api(request, method, path, coach, body),
      (method, path, body) => api(request, method, path, admin, body),
    );
    cookies.coach = coach;

    const page = await signedIn(context, "coach");
    const writes = countWrites(page, /^\/approvals$/);
    await page.goto("/coach/schedule");
    await page.getByRole("button", { name: /Request extra class/ }).click();
    const dialog = page.getByRole("dialog", { name: "Request an extra class" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Send request" }).click();
    await expectFieldError(page, "request-reason", "Give a short reason.");
    await dialog.locator("#request-reason").fill("ok");
    await expect(page.locator("#request-reason-error")).toBeHidden();
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expectFieldError(page, "request-reason", "Give a short reason.");
    expect(writes.count, "a refused request must send nothing").toBe(0);

    const reason = `E2E form check ${stamp()}`;
    await dialog.locator("#request-reason").fill(reason);
    await dialog.locator("#request-topic").fill("E2E form check");
    const sent = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/approvals");
    await dialog.getByRole("button", { name: "Send request" }).click();
    const response = await sent;
    if (response.ok()) {
      await expect(dialog).toBeHidden();
      const undo = page.getByRole("button", { name: "Undo" });
      await expect(undo).toBeVisible();
      const requestId: string = (await response.json()).request.id;
      const cancelled = page.waitForResponse((r) => new URL(r.url()).pathname === `/approvals/${requestId}/cancel`);
      await undo.click();
      expect((await cancelled).ok(), "Undo cancels the request").toBeTruthy();
    } else {
      // The API refused it (e.g. a clash): a toast with a human message, the dialog stays open.
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /\w{4,}/ }).first()).toBeVisible();
    }
    await request.dispose();
  });

  test("deploy assignment: no batch and no due date are refused under their fields and nothing is sent", async ({ context }) => {
    const page = await signedIn(context, "coach");
    const writes = countWrites(page, /\/deploy/);
    await page.goto("/coach/assignments");
    const assign = page.getByRole("button", { exact: true, name: "Assign" }).first();
    await expect(assign, "the seeded coach needs at least one assignment in the library").toBeVisible({ timeout: 20_000 });
    await assign.click();
    const dialog = page.getByRole("dialog", { name: "Assign to batches" });
    await dialog.getByRole("button", { exact: true, name: "Assign" }).click();
    await expect(page.locator("#deploy-batches-error")).toContainText("Select at least one batch");
    await expectFieldError(page, "deploy-dueDate", "Pick a due date");
    await expect(dialog.getByRole("group", { name: "Batches" })).toHaveAttribute("aria-describedby", /deploy-batches-error/);

    await dialog.getByRole("checkbox").first().check();
    await expect(page.locator("#deploy-batches-error")).toBeHidden();
    await dialog.getByRole("button", { exact: true, name: "Assign" }).click();
    await expectFieldError(page, "deploy-dueDate", "Pick a due date");
    expect(writes.count, "a refused deploy must send nothing").toBe(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("voucher: empty and over-100% are refused under their fields; a valid one is saved and deleted", async ({ context }) => {
    const page = await signedIn(context, "admin");
    const writes = countWrites(page, /\/admin\/referrals\/vouchers/);
    await page.goto("/admin/referrals");
    await page.getByRole("tab", { name: "Vouchers" }).click();
    await page.getByRole("button", { name: "New voucher" }).click();
    const dialog = page.getByRole("dialog", { name: "New voucher" });

    await dialog.getByRole("button", { name: /^(Save|Create)/ }).click();
    await expectFieldError(page, "voucher-name", "Name is required.");
    await expectFieldError(page, "voucher-cost", "Enter a whole number of points.");

    const name = `E2E voucher ${stamp()}`;
    await dialog.locator("#voucher-name").fill(name);
    await dialog.locator("#voucher-cost").fill("50");
    await dialog.locator("#voucher-percent").fill("150");
    await dialog.getByRole("button", { name: /^(Save|Create)/ }).click();
    await expectFieldError(page, "voucher-percent", "at most 100%");
    expect(writes.count, "a refused voucher must send nothing").toBe(0);

    await dialog.locator("#voucher-percent").fill("10");
    // Switched off, so no student sees it while it exists.
    const active = dialog.locator("#voucher-active");
    if (await active.isChecked()) await active.click();
    await dialog.getByRole("button", { name: /^(Save|Create)/ }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();

    await rowAction(page, row, "Delete voucher");
    await page.getByRole("button", { name: "Delete voucher" }).last().click();
    await expect(row).toHaveCount(0);
  });

  test("referral stage: empty name and a negative reward are refused under their fields; a valid stage is added and deleted", async ({ context }) => {
    const page = await signedIn(context, "admin");
    const writes = countWrites(page, /\/admin\/referrals\/stages/);
    await page.goto("/admin/referrals");
    await page.getByRole("tab", { name: "Stages" }).click();
    await page.getByRole("button", { name: /Add (a )?stage/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add a stage" });
    const save = dialog.getByRole("button", { name: /^(Save|Add)/ });

    await save.click();
    await expect(page.locator("#stage-name-error")).toBeVisible();

    const name = `E2E stage ${stamp()}`;
    await dialog.locator("#stage-name").fill(name);
    await dialog.locator("#stage-student").fill("-3");
    await save.click();
    await expectFieldError(page, "stage-student", "Use a whole number, 0 or more");
    await dialog.locator("#stage-student").fill("abc");
    await save.click();
    await expectFieldError(page, "stage-student", "Use a whole number, 0 or more");
    expect(writes.count, "a refused stage must send nothing").toBe(0);

    await dialog.locator("#stage-student").fill("0");
    await save.click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible();
    await rowAction(page, row, "Delete stage");
    await page.getByRole("button", { name: "Delete stage" }).last().click();
    await expect(row).toHaveCount(0);
  });

  test("withdrawal: paid needs a reference, rejected needs a reason (stubbed row, writes blocked)", async ({ context }) => {
    const page = await signedIn(context, "admin");
    const withdrawal: ReferralWithdrawalItem = {
      adminNote: null,
      amountMinor: 150_000,
      createdAt: new Date().toISOString(),
      currency: "INR",
      id: "e2e-withdrawal-stub",
      payoutDetails: "UPI e2e@stub",
      payoutReference: null,
      reviewedAt: null,
      status: "REQUESTED",
      userId: "e2e-user-stub",
      userName: "E2E Stub Coach",
      userRole: "COACH",
    };
    await stubGet(page, "/admin/referrals/withdrawals", {
      items: [withdrawal],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const blocked = await blockWrites(page, /\/admin\/referrals\/withdrawals/);
    await page.goto("/admin/referrals");
    await page.getByRole("tab", { name: "Withdrawals" }).click();
    const row = page.getByRole("row").filter({ hasText: "E2E Stub Coach" });
    await expect(row).toBeVisible();

    await rowAction(page, row, "Mark as paid");
    let dialog = page.getByRole("dialog", { name: "Mark withdrawal as paid" });
    await dialog.getByRole("button", { name: /^Mark/ }).click();
    await expectFieldError(page, "withdrawal-reference", "Add the transfer reference");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await rowAction(page, row, "Reject");
    dialog = page.getByRole("dialog", { name: "Reject withdrawal" });
    await dialog.getByRole("button", { name: /^Reject/ }).click();
    await expectFieldError(page, "withdrawal-note", "Say why");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(blocked.count, "a refused withdrawal action must send nothing").toBe(0);
  });

  test("refund: an amount over the balance is refused under the field; no reason keeps Refund disabled (stubbed payment, writes blocked)", async ({ context }) => {
    const page = await signedIn(context, "admin");
    const payment: PaymentListItem = {
      amount: 250_000,
      amountRefunded: 50_000,
      attempts: 1,
      createdAt: new Date().toISOString(),
      currency: "INR",
      failureCode: null,
      failureMessage: null,
      id: "e2e-payment-stub",
      invoiceId: null,
      invoiceNumber: null,
      method: "UPI",
      methodDetail: "UPI — stub",
      orderId: "e2e-order-stub",
      orderNumber: "E2E-STUB-0001",
      paidAt: new Date().toISOString(),
      planName: "E2E Stub Plan",
      provider: "RAZORPAY",
      providerPaymentId: "pay_e2e_stub",
      status: "PARTIALLY_REFUNDED",
      userEmail: "stub@nexa.test",
      userId: "e2e-user-stub",
      userName: "E2E Stub Student",
    };
    await stubGet(page, "/admin/payments", { meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 }, payments: [payment] });
    const blocked = await blockWrites(page, /\/admin\/payments\/.+\/refund$/);
    await page.goto("/admin/payments");
    await page.getByRole("tab", { name: "Transactions" }).click();
    const row = page.getByRole("row").filter({ hasText: "E2E-STUB-0001" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Refund this payment" }).click();

    const dialog = page.getByRole("dialog", { name: /Refund E2E-STUB-0001/ });
    const submit = dialog.getByRole("button", { name: /^Refund/ });
    await expect(submit, "no reason yet").toBeDisabled();
    await dialog.getByLabel("Why is this being refunded?", { exact: false }).or(dialog.locator("#refund-reason")).first().fill("E2E check, never sent");
    await expect(submit).toBeEnabled();

    await dialog.getByRole("switch").first().click(); // partial amount
    await dialog.locator("#refund-amount").fill("2500");
    await expectFieldError(page, "refund-amount", /Enter an amount between 0 and/);
    await expect(submit).toBeDisabled();
    await dialog.locator("#refund-amount").fill("0");
    await expect(submit).toBeDisabled();
    await dialog.locator("#refund-amount").fill("100");
    await expect(page.locator("#refund-amount-error")).toBeHidden();
    await expect(submit).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(blocked.count, "nothing may reach the refund route").toBe(0);
  });

  test("credit note: a partial amount over the balance or zero keeps Issue disabled (stubbed invoice, writes blocked)", async ({ context }) => {
    const page = await signedIn(context, "admin");
    const now = new Date().toISOString();
    const invoice: InvoiceItem = {
      amountRefunded: 0,
      billing: { country: "IN", name: "E2E Stub Student" },
      cgstAmount: 0,
      createdAt: now,
      currency: "INR",
      discountAmount: 0,
      discountCode: null,
      dueDate: null,
      emailSent: false,
      emailSentAt: null,
      footer: null,
      id: "e2e-invoice-stub",
      igstAmount: 0,
      invoiceDate: now,
      lines: [{ amount: 100_000, description: "E2E Stub Plan", discountAmount: 0, productId: null, quantity: 1, taxAmount: 0, taxRate: 0, unitAmount: 100_000 }],
      notes: null,
      number: "E2E-INV-0001",
      orderId: "e2e-order-stub",
      orderNumber: "E2E-STUB-0001",
      paidAt: now,
      payment: { method: "UPI", methodDetail: null, paidAt: now, provider: "RAZORPAY", transactionId: null },
      paymentId: null,
      pdfStatus: "READY",
      seller: {
        addressLine1: null, addressLine2: null, city: null, country: "IN", email: null, gstin: null, legalName: "E2E Stub Academy",
        logoUrl: null, pan: null, phone: null, postalCode: null, state: null, stateCode: null, tradeName: null, website: null,
      },
      sgstAmount: 0,
      status: "PAID",
      subtotal: 100_000,
      taxableAmount: 100_000,
      taxLabel: null,
      taxRatePercent: 0,
      taxTotal: 0,
      taxTreatment: "NONE",
      terms: null,
      total: 100_000,
      userEmail: "stub@nexa.test",
      userId: "e2e-user-stub",
      userName: "E2E Stub Student",
    };
    await stubGet(page, "/admin/finance/invoices", {
      invoices: [invoice],
      page: 1,
      pageSize: 50,
      stats: { failedPdfCount: 0, paidInvoices: 1, refundedByCurrency: {}, refundedInvoices: 0, revenueByCurrency: { INR: 100_000 }, taxByCurrency: {}, totalInvoices: 1 },
      total: 1,
    });
    const blocked = await blockWrites(page, /credit-notes?/);
    await page.goto("/admin/finance/invoices");
    const row = page.getByRole("row").filter({ hasText: "E2E-INV-0001" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await rowAction(page, row, "Issue a credit note against E2E-INV-0001");

    const dialog = page.getByRole("dialog", { name: "Issue a credit note" });
    const issue = dialog.getByRole("button", { name: "Issue credit note" });
    await expect(issue, "full credit is valid by default").toBeEnabled();
    await dialog.locator("#credit-full").click();
    await dialog.locator("#credit-amount").fill("5000");
    await expect(issue, "more than the invoice").toBeDisabled();
    await dialog.locator("#credit-amount").fill("0");
    await expect(issue).toBeDisabled();
    await dialog.locator("#credit-amount").fill("");
    await expect(issue).toBeDisabled();
    await dialog.locator("#credit-amount").fill("250");
    await expect(issue).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(blocked.count, "nothing may reach the credit-note route").toBe(0);
  });
});
