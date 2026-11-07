import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  LEGAL_TERMS_VERSION,
  type AdminReferralDetail,
  type MyReferralSummary,
  type MyReferralVoucherCatalogue,
  type ReferralItem,
  type ReferralPage,
  type ReferralRedemptionItem,
  type ReferralVisitResponse,
  type ReferralVoucherItem
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { TEST_ORIGIN } from "../test/integration/app-env";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

/**
 * The referral programme end to end (docs/REFERRALS.md): a link visit, the
 * academy lead form, CRM and admin moves, stage values and bonuses, the
 * points/money ledger, voucher redemptions and the SALES fence.
 */
describe("referral programme (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let student: User;
  let sales: User;

  const active = async (role: UserRole) =>
    t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });

  /** An anonymous browser with its own cookie jar. */
  const browser = () => {
    let cookies: string[] = [];
    return async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Origin: TEST_ORIGIN,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookies.length ? { Cookie: cookies.join("; ") } : {})
        },
        method
      });
      for (const header of res.headers.getSetCookie()) {
        const pair = header.split(";")[0]!;
        cookies = [...cookies.filter((c) => !c.startsWith(`${pair.split("=")[0]}=`)), pair];
      }
      return { body: (await res.json().catch(() => null)) as unknown, status: res.status };
    };
  };

  const summary = async (user: User) => (await t.call(user, "GET", API_ROUTES.referrals.me)).body as MyReferralSummary;
  const lead = (name: string, phone: string, extra: Record<string, unknown> = {}) => ({
    experienceLevel: "beginner",
    parentName: `${name} Parent`,
    phone,
    studentAge: 9,
    studentName: name,
    ...extra
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.SUPER_ADMIN);
    student = await active(UserRole.STUDENT);
    sales = await active(UserRole.SALES);
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  const stageValues = (id: string, body: Record<string, number>) => t.call(admin, "PATCH", API_ROUTES.adminReferrals.stage(id), body);
  const settings = (body: Record<string, unknown>) => t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, body);

  it("tracks a referral from link visit to onboarding and pays the stage values and bonuses", async () => {
    // The reset wiped the stages; the first read re-seeds the defaults.
    await t.call(admin, "GET", API_ROUTES.adminReferrals.stages);
    expect((await stageValues("refstage_attended", { coachCashMinor: 7000, studentPoints: 100 })).status).toBe(200);
    expect((await stageValues("refstage_converted", { studentPoints: 500 })).status).toBe(200);
    expect((await stageValues("refstage_converted", { studentPoints: -1 })).status).toBe(400);
    const bonus = (body: Record<string, unknown>) =>
      t.call(admin, "POST", API_ROUTES.adminReferrals.bonusRules, { autoApprove: true, isActive: true, stageId: "refstage_booked", ...body });
    expect((await bonus({ amount: 50, audience: "STUDENTS", everyCount: 1, name: "x" })).status).toBe(400);
    expect((await bonus({ amount: 50, audience: "STUDENTS", everyCount: 2, name: "Every two" })).status).toBe(201);
    expect((await bonus({ amount: 9000, audience: "STAFF", everyCount: 2, name: "Staff every two" })).status).toBe(201);

    const code = (await summary(student)).code!;
    expect(code).toMatch(/^[A-Z0-9]{4,16}$/);

    // Visitor 1: two visits (one referral), then books a demo through the form.
    const visitor = browser();
    expect((await visitor("POST", API_ROUTES.referrals.visit, { code: code.toLowerCase() })).body).toEqual({ benefits: [], referrerFirstName: student.firstName, valid: true });
    await visitor("POST", API_ROUTES.referrals.visit, { code });
    expect((await visitor("POST", API_ROUTES.leads.create, lead("Priya Sharma", "9876543210"))).status).toBe(201);
    // Visitor 2: never visited, typed the code.
    expect((await browser()("POST", API_ROUTES.leads.create, lead("Arjun Kumar", "9123456780", { referralCode: code }))).status).toBe(201);
    // The owner opening their own link, and an unknown code, count nothing.
    await t.call(student, "POST", API_ROUTES.referrals.visit, { code });
    expect((await browser()("POST", API_ROUTES.referrals.visit, { code: "NOPE1234" })).body).toEqual({ benefits: [], referrerFirstName: null, valid: false });

    let mine = (await t.call(student, "GET", API_ROUTES.referrals.myReferrals)).body as ReferralPage<ReferralItem>;
    expect(mine.items.map((r) => [r.prospectName, r.stageName, r.visits, r.contact]).sort()).toEqual([
      ["Arjun K.", "Demo booked", 0, null],
      ["Priya S.", "Demo booked", 2, null]
    ]);
    let me = await summary(student);
    expect(me.totals).toEqual({ converted: 0, referrals: 2, visits: 2 });
    // A student earns points only: the students' bonus, never the staff one.
    expect([me.wallet, me.money, me.points.balance]).toEqual(["POINTS", null, 50]);
    expect(me.bonuses.map((b) => b.name)).toEqual(["Every two"]);
    expect(me.earnings.map((e) => [e.stageName, e.referrer])).toEqual([
      ["Demo attended", 100],
      ["Onboarded", 500]
    ]);

    // The CRM marks Priya attended: the referral follows, the stage's points are credited.
    const priyaLead = await t.prisma.lead.findFirstOrThrow({ where: { studentName: "Priya Sharma" } });
    await t.call(admin, "PATCH", API_ROUTES.adminLeads.updateStatus(priyaLead.id), { status: "DEMO_ATTENDED" });
    const priya = await t.prisma.referral.findFirstOrThrow({ where: { leadId: priyaLead.id } });
    expect((await t.prisma.referral.findUniqueOrThrow({ where: { id: priya.id } })).stageId).toBe("refstage_attended");

    // With point approval switched on, onboarding waits for an admin, once.
    await settings({ autoApprovePoints: false });
    const moved = await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(priya.id), { note: "Paid", stageId: "refstage_converted" });
    expect((moved.body as AdminReferralDetail).rewards.map((r) => [r.sourceName, r.unit, r.status]).sort()).toEqual([
      ["Stage: Demo attended", "POINTS", "CREDITED"],
      ["Stage: Onboarded", "POINTS", "PENDING"]
    ]);
    // A later CRM "lost" never pulls an onboarded referral back.
    await t.call(admin, "PATCH", API_ROUTES.adminLeads.updateStatus(priyaLead.id), { status: "LOST" });
    expect((await t.prisma.referral.findUniqueOrThrow({ where: { id: priya.id } })).stageId).toBe("refstage_converted");
    // Back and forth does not pay twice.
    await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(priya.id), { stageId: "refstage_booked" });
    await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(priya.id), { stageId: "refstage_converted" });
    expect(await t.prisma.referralReward.count({ where: { referralId: priya.id } })).toBe(2);

    const pending = await t.prisma.referralReward.findFirstOrThrow({ where: { status: "PENDING" } });
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.approveReward(pending.id))).status).toBe(200);
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.approveReward(pending.id))).status).toBe(409);
    await settings({ autoApprovePoints: true });

    me = await summary(student);
    expect(me.totals.converted).toBe(1);
    expect(me.points).toEqual({ balance: 650, earned: 650, pending: 0, redeemed: 0 });
    mine = (await t.call(student, "GET", API_ROUTES.referrals.myReferrals)).body as ReferralPage<ReferralItem>;
    expect(mine.items.find((r) => r.id === priya.id)?.convertedAt).not.toBeNull();
    // Students never withdraw.
    expect((await t.call(student, "POST", API_ROUTES.referrals.myWithdrawals, { amountMinor: 100, payoutDetails: "me@upi" })).status).toBe(403);
  });

  it("lets a student spend points on vouchers: discounts, free days, approval, limits", async () => {
    const other = await active(UserRole.STUDENT);
    const coach = await active(UserRole.COACH);
    const plan = await t.prisma.plan.create({ data: { amount: 99900, code: "ref-plan", currency: "INR", name: "Monthly" } });
    const voucher = async (body: Record<string, unknown>) => {
      const res = await t.call(admin, "POST", API_ROUTES.adminReferrals.vouchers, { name: "Voucher", planIds: [plan.id], ...body });
      return res;
    };
    const redeem = (user: User, id: string, body: Record<string, unknown> = {}) => t.call(user, "POST", API_ROUTES.referrals.redeemVoucher(id), body);
    const points = async (user: User) => (await summary(user)).points.balance;

    // Shape rules.
    expect((await voucher({ pointsCost: 10, type: "PERCENT_DISCOUNT" })).status).toBe(400);
    expect((await voucher({ amountOffMinor: 500, maxDiscountMinor: 100, pointsCost: 10, type: "FIXED_DISCOUNT" })).status).toBe(400);
    expect((await voucher({ planIds: ["nope"], percentOff: 5, pointsCost: 10, type: "PERCENT_DISCOUNT" })).status).toBe(400);

    // 20% off (at most ₹100) on fees of ₹500+, once per student.
    const percent = (await voucher({ maxDiscountMinor: 10000, minOrderMinor: 50000, name: "20% off", percentOff: 20, perUserLimit: 1, pointsCost: 200, type: "PERCENT_DISCOUNT" })).body as ReferralVoucherItem;
    const store = (await t.call(student, "GET", API_ROUTES.referrals.myVouchers)).body as MyReferralVoucherCatalogue;
    expect(store).toMatchObject({ canRedeem: true, pointsBalance: 650 });
    expect(store.vouchers.map((v) => [v.name, v.unavailableReason])).toEqual([["20% off", null]]);

    const bought = await redeem(student, percent.id);
    expect(bought.status).toBe(200);
    const code = (bought.body as ReferralRedemptionItem).discountCode!;
    expect(bought.body).toMatchObject({ discountStatus: "ACTIVE", pointsCost: 200, status: "FULFILLED" });
    expect(await points(student)).toBe(450);
    const preview = (user: User) => t.call(user, "POST", API_ROUTES.payments.previewDiscount, { code, planId: plan.id });
    expect((await preview(student)).body).toMatchObject({ discountAmount: 10000, valid: true });
    expect((await preview(other)).body).toMatchObject({ reason: "NOT_FOUND", valid: false });
    expect(JSON.stringify((await t.call(admin, "GET", API_ROUTES.adminPayments.discounts)).body)).not.toContain(code);
    expect((await redeem(student, percent.id)).status).toBe(409); // once per student

    // 30 free days, one in stock, each request approved by an admin.
    const month = (await voucher({ freeDays: 30, name: "A free month", pointsCost: 100, requiresApproval: true, stock: 1, type: "FREE_DAYS" })).body as ReferralVoucherItem;
    let request = (await redeem(student, month.id)).body as ReferralRedemptionItem;
    expect(request).toMatchObject({ status: "PENDING" });
    expect(await points(student)).toBe(350); // held
    expect((await t.call(other, "POST", API_ROUTES.referrals.cancelRedemption(request.id))).status).toBe(404);
    expect((await t.call(student, "POST", API_ROUTES.referrals.cancelRedemption(request.id))).status).toBe(200);
    expect(await points(student)).toBe(450);
    request = (await redeem(student, month.id)).body as ReferralRedemptionItem;
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.rejectRedemption(request.id), { adminNote: "Not yet" })).status).toBe(200);
    expect(await points(student)).toBe(450);
    request = (await redeem(student, month.id)).body as ReferralRedemptionItem;
    expect((await t.call(student, "POST", API_ROUTES.adminReferrals.approveRedemption(request.id))).status).toBe(403);
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.approveRedemption(request.id))).status).toBe(200);
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.approveRedemption(request.id))).status).toBe(409);
    expect(await points(student)).toBe(350);
    const access = await t.prisma.entitlement.findFirstOrThrow({ where: { planId: plan.id, userId: student.id } });
    expect(access.orderId).toBeNull();
    const days = (access.endsAt!.getTime() - access.startsAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect((await redeem(other, month.id)).status).toBe(409); // out of stock

    // A free week on any plan the student holds extends that access.
    const week = (await voucher({ freeDays: 7, name: "A free week", planIds: [], pointsCost: 50, type: "FREE_DAYS" })).body as ReferralVoucherItem;
    const otherStore = (await t.call(other, "GET", API_ROUTES.referrals.myVouchers)).body as MyReferralVoucherCatalogue;
    expect(otherStore.vouchers.find((v) => v.id === week.id)?.unavailableReason).toBe("Needs an active plan");
    expect((await redeem(other, week.id)).status).toBe(400);
    const extended = (await redeem(student, week.id)).body as ReferralRedemptionItem;
    expect(new Date(extended.accessEndsAt!).getTime() - access.endsAt!.getTime()).toBe(7 * 86_400_000);
    expect(extended.planName).toBe("Monthly");

    // An unused code can be taken back (points returned); free days cannot.
    const percentRedemption = await t.prisma.referralRedemption.findFirstOrThrow({ where: { voucherId: percent.id } });
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.revokeRedemption(extended.id), { adminNote: "x" })).status).toBe(409);
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.revokeRedemption(percentRedemption.id), { adminNote: "Wrong code" })).status).toBe(200);
    expect((await preview(student)).body).toMatchObject({ valid: false });
    expect(await points(student)).toBe(500);

    // Only students redeem, and only while the store is open; the 30-day cap counts live redemptions.
    expect(((await t.call(coach, "GET", API_ROUTES.referrals.myVouchers)).body as MyReferralVoucherCatalogue).canRedeem).toBe(false);
    expect((await redeem(coach, week.id)).status).toBe(403);
    await settings({ redemptionsEnabled: false });
    expect((await redeem(student, week.id)).status).toBe(403);
    await settings({ maxRedemptionsPer30Days: 2, redemptionsEnabled: true });
    expect((await redeem(student, week.id)).status).toBe(409); // the month + the week
    await settings({ maxRedemptionsPer30Days: 0 });

    // Parallel redemptions never overspend: 300 points buy three 100-point vouchers, not five.
    const fixed = (await voucher({ amountOffMinor: 5000, name: "₹50 off", pointsCost: 100, type: "FIXED_DISCOUNT" })).body as ReferralVoucherItem;
    await t.call(admin, "POST", API_ROUTES.adminReferrals.adjustCredits, { amountMinor: -200, note: "Reset", userId: student.id, wallet: "POINTS" });
    const parallel = await Promise.all(Array.from({ length: 5 }, () => redeem(student, fixed.id)));
    expect(parallel.map((r) => r.status).sort()).toEqual([200, 200, 200, 400, 400]);
    expect(await points(student)).toBe(0);

    // Points history: every movement, for the student and the admin.
    const history = (await t.call(student, "GET", API_ROUTES.referrals.myCredits)).body as { type: string }[];
    expect(new Set(history.map((e) => e.type))).toEqual(new Set(["REWARD", "REDEMPTION", "REDEMPTION_REVERSAL", "ADJUSTMENT"]));
    const ledger = (await t.call(admin, "GET", `${API_ROUTES.adminReferrals.ledger}?type=REDEMPTION_REVERSAL&userId=${student.id}`)).body as ReferralPage<unknown>;
    expect(ledger.pagination.total).toBe(3); // cancelled, rejected, revoked
    expect((await t.call(student, "GET", API_ROUTES.adminReferrals.ledger)).status).toBe(403);
    const admins = (await t.call(admin, "GET", `${API_ROUTES.adminReferrals.redemptions}?status=FULFILLED&userId=${student.id}`)).body as ReferralPage<unknown>;
    expect(admins.pagination.total).toBe(5); // the month, the week, three ₹50 codes

    // A redeemed voucher is switched off, not deleted.
    expect((await t.call(admin, "DELETE", API_ROUTES.adminReferrals.voucher(fixed.id))).body).toEqual({ deleted: false });
  });

  it("gives the new member welcome points and pays a coach money", async () => {
    const coach = await active(UserRole.COACH);
    expect((await stageValues("refstage_booked", { coachCashMinor: 2000, newMemberPoints: 200 })).status).toBe(200);

    // The landing page shows what the new member gets.
    const code = (await summary(coach)).code!;
    const visitor = browser();
    const visit = (await visitor("POST", API_ROUTES.referrals.visit, { code })).body as ReferralVisitResponse;
    expect(visit.benefits).toEqual([{ points: 200, stageId: "refstage_booked", stageName: "Demo booked" }]);
    await visitor("POST", API_ROUTES.leads.create, lead("Rohan Das", "9555512345"));
    // Money waits for an admin by default.
    let me = await summary(coach);
    expect([me.wallet, me.money, me.points.balance]).toEqual(["CASH", { balanceMinor: 0, earnedMinor: 0, pendingMinor: 2000 }, 0]);

    // Signing up from the same browser links the account (referral cookie) and pays the welcome points.
    const signup = await visitor("POST", API_ROUTES.auth.register, {
      acceptedTerms: true,
      confirmPassword: "Test@12345",
      contactNumber: "9555512345",
      email: "rohan.new@example.com",
      parentName: "Rohan Parent",
      password: "Test@12345",
      studentAge: "9",
      studentName: "Rohan Das"
    });
    expect(signup.status).toBe(201);
    const rohan = await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { tenantId_email: { email: "rohan.new@example.com", tenantId: DEFAULT_TENANT_ID } } });
    // The sign-up checkbox is stored with the server's version of the terms.
    expect(rohan.termsVersion).toBe(LEGAL_TERMS_VERSION);
    expect(rohan.termsAcceptedAt).toBeInstanceOf(Date);
    const referral = await t.prisma.referral.findFirstOrThrow({ where: { referredUserId: rohan.id } });
    expect(referral.referrerId).toBe(coach.id);
    const rohanSummary = await summary(rohan);
    expect([rohanSummary.points.balance, rohanSummary.money]).toEqual([200, null]);
    // Linking to the referrer is refused.
    expect((await t.call(admin, "PUT", API_ROUTES.adminReferrals.linkUser(referral.id), { email: coach.email })).status).toBe(400);

    const pending = await t.prisma.referralReward.findFirstOrThrow({ where: { referrerId: coach.id, status: "PENDING" } });
    expect(pending).toMatchObject({ amountMinor: 2000, unit: "CASH" });
    await t.call(admin, "POST", API_ROUTES.adminReferrals.approveReward(pending.id));
    me = await summary(coach);
    expect(me.money).toEqual({ balanceMinor: 2000, earnedMinor: 2000, pendingMinor: 0 });

    // Points never move between users or turn into money: those routes are gone.
    expect((await t.call(rohan, "POST", "/referrals/me/points/transfer", { email: coach.email, points: 10 })).status).toBe(404);
    expect((await t.call(rohan, "POST", "/referrals/me/points/convert", { points: 10 })).status).toBe(404);
    await stageValues("refstage_booked", { coachCashMinor: 0, newMemberPoints: 0 });
  });

  it("serialises withdrawals so the same credits are never paid twice", async () => {
    await t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, { minWithdrawalMinor: 100 });
    expect(
      (await t.call(admin, "POST", API_ROUTES.adminReferrals.adjustCredits, { amountMinor: 20000, note: "Bonus", userId: sales.id, wallet: "CASH" })).status
    ).toBe(200);

    // One call first, so the parallel ones below share an existing session row.
    await summary(sales);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => t.call(sales, "POST", API_ROUTES.referrals.myWithdrawals, { amountMinor: 20000, payoutDetails: "s@upi" }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400, 400, 400, 400]);
    expect((await summary(sales)).money?.balanceMinor).toBe(0);

    const withdrawal = await t.prisma.referralWithdrawal.findFirstOrThrow({ where: { userId: sales.id } });
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.rejectWithdrawal(withdrawal.id), { adminNote: "Wrong UPI" })).status).toBe(200);
    expect((await summary(sales)).money?.balanceMinor).toBe(20000);
    expect((await t.call(sales, "POST", API_ROUTES.referrals.cancelWithdrawal(withdrawal.id))).status).toBe(409);
  });

  it("fences SALES to the referral board", async () => {
    expect((await t.call(sales, "GET", API_ROUTES.auth.me)).status).toBe(200);
    expect((await t.call(sales, "GET", API_ROUTES.referrals.me)).status).toBe(200);
    expect((await t.call(sales, "GET", API_ROUTES.subscription.current)).status).toBe(200);
    for (const path of [API_ROUTES.student.dashboard, API_ROUTES.users.list, API_ROUTES.notifications.list, API_ROUTES.adminReferrals.overview]) {
      expect({ path, status: (await t.call(sales, "GET", path)).status }).toEqual({ path, status: 403 });
    }
    // SALES sees its own prospects in full, contact included.
    const code = (await summary(sales)).code!;
    const visitor = browser();
    await visitor("POST", API_ROUTES.referrals.visit, { code });
    await visitor("POST", API_ROUTES.leads.create, lead("Kavya Rao", "9000011111"));
    const mine = (await t.call(sales, "GET", API_ROUTES.referrals.myReferrals)).body as ReferralPage<ReferralItem>;
    expect(mine.items[0]).toMatchObject({ contact: { phone: "9000011111" }, prospectName: "Kavya Rao" });
  });

  it("sends a sales account a one-use set-password link (sales only, admin only)", async () => {
    const coach = await active(UserRole.COACH);
    const path = (id: string) => API_ROUTES.adminReferrals.referrerAccessLink(id);
    expect((await t.call(admin, "POST", path(coach.id), { channels: ["EMAIL"] })).status).toBe(404);
    expect((await t.call(sales, "POST", path(sales.id), { channels: ["EMAIL"] })).status).toBe(403);
    expect((await t.call(admin, "POST", path(sales.id), { channels: [] })).status).toBe(400);
    expect((await t.call(admin, "POST", path(sales.id), { channels: ["WHATSAPP"] })).status).toBe(400); // no phone yet

    const before = await t.prisma.passwordResetToken.count({ where: { userId: sales.id } });
    const sent = await t.call(admin, "POST", path(sales.id), { channels: ["EMAIL", "WHATSAPP"], phoneNumber: "+91 98765 43210" });
    expect(sent.status).toBe(200);
    // No SMTP or WhatsApp in the test box: each channel reports, nothing throws.
    expect(sent.body).toMatchObject({ email: expect.stringMatching(/SENT|FAILED/), whatsapp: expect.stringMatching(/SENT|FAILED/) });
    expect(await t.prisma.passwordResetToken.count({ where: { userId: sales.id } })).toBe(before + 1);
    const token = await t.prisma.passwordResetToken.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { userId: sales.id } });
    expect(token.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: sales.id } })).phoneNumber).toBe("+91 98765 43210");
  });

  it("lets admins delete a referral, but not one that earned rewards", async () => {
    const priya = await t.prisma.referral.findFirstOrThrow({ where: { prospectName: "Priya Sharma" } });
    expect((await t.call(admin, "DELETE", API_ROUTES.adminReferrals.delete(priya.id))).status).toBe(409);
    // A visit-only referral (no rewards) can go.
    const before = await t.prisma.referral.count();
    await browser()("POST", API_ROUTES.referrals.visit, { code: (await summary(student)).code });
    const spam = await t.prisma.referral.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { leadId: null } });
    expect(await t.prisma.referral.count()).toBe(before + 1);
    expect((await t.call(student, "DELETE", API_ROUTES.adminReferrals.delete(spam.id))).status).toBe(403);
    expect((await t.call(admin, "DELETE", API_ROUTES.adminReferrals.delete(spam.id))).status).toBe(200);
    expect(await t.prisma.referral.findUnique({ where: { id: spam.id } })).toBeNull();
  });

  it("lets admins edit the pipeline; deleting a stage moves its referrals back", async () => {
    const stage = (await t.call(admin, "POST", API_ROUTES.adminReferrals.stages, { name: "Contacted", tone: "accent" })).body as { id: string };
    const kavya = await t.prisma.referral.findFirstOrThrow({ where: { prospectName: "Kavya Rao" } });
    await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(kavya.id), { stageId: stage.id });
    const stages = (await t.call(admin, "GET", API_ROUTES.adminReferrals.stages)).body as { id: string }[];
    const ids = stages.map((s) => s.id);
    // Contacted (added last) goes back between the booking and attendance stages.
    const reordered = [ids[0]!, ids[1]!, stage.id, ...ids.slice(2).filter((id) => id !== stage.id)];
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.reorderStages, { stageIds: reordered })).status).toBe(200);
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.reorderStages, { stageIds: reordered.slice(1) })).status).toBe(400);

    expect((await t.call(admin, "DELETE", API_ROUTES.adminReferrals.stage("refstage_booked"))).status).toBe(400);
    expect((await t.call(admin, "DELETE", API_ROUTES.adminReferrals.stage(stage.id))).status).toBe(200);
    expect((await t.prisma.referral.findUniqueOrThrow({ where: { id: kavya.id } })).stageId).toBe("refstage_booked");
  });
});
