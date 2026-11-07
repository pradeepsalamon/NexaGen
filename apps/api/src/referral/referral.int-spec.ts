import { API_ROUTES, DEFAULT_TENANT_ID, LEGAL_TERMS_VERSION, type AdminReferralDetail, type MyReferralSummary, type ReferralItem, type ReferralPage } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { TEST_ORIGIN } from "../test/integration/app-env";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

/**
 * The referral programme end to end (docs/REFERRALS.md): a link visit, the
 * academy lead form, CRM and admin moves, reward rules, the credits ledger,
 * personal payment codes and the SALES fence.
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

  it("tracks a referral from link visit to onboarding and pays the rules", async () => {
    const rule = (body: Record<string, unknown>) => t.call(admin, "POST", API_ROUTES.adminReferrals.rewardRules, {
      autoApprove: false,
      isActive: true,
      kind: "PER_REFERRAL",
      roles: [],
      ...body
    });
    expect((await rule({ amountMinor: 50000, name: "Onboarded", stageId: "refstage_converted" })).status).toBe(201);
    expect((await rule({ amountMinor: 10000, autoApprove: true, name: "Attended", roles: ["STUDENT"], stageId: "refstage_attended" })).status).toBe(201);
    expect((await rule({ amountMinor: 7000, autoApprove: true, name: "Coaches only", roles: ["COACH"], stageId: "refstage_attended" })).status).toBe(201);
    expect(
      (await rule({ amountMinor: 5000, autoApprove: true, kind: "MILESTONE", milestoneCount: 2, name: "Every two", stageId: "refstage_booked" })).status
    ).toBe(201);

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
    expect(me.credits.balanceMinor).toBe(5000); // the "every two bookings" milestone

    // The CRM marks Priya attended: the referral follows, the student-only rule pays.
    const priyaLead = await t.prisma.lead.findFirstOrThrow({ where: { studentName: "Priya Sharma" } });
    await t.call(admin, "PATCH", API_ROUTES.adminLeads.updateStatus(priyaLead.id), { status: "DEMO_ATTENDED" });
    const priya = await t.prisma.referral.findFirstOrThrow({ where: { leadId: priyaLead.id } });
    expect((await t.prisma.referral.findUniqueOrThrow({ where: { id: priya.id } })).stageId).toBe("refstage_attended");

    // An admin onboards her; the reward waits for approval, once.
    const moved = await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(priya.id), { note: "Paid", stageId: "refstage_converted" });
    expect((moved.body as AdminReferralDetail).rewards.map((r) => [r.ruleName, r.status]).sort()).toEqual([
      ["Attended", "CREDITED"],
      ["Onboarded", "PENDING"]
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

    me = await summary(student);
    expect(me.totals.converted).toBe(1);
    expect(me.credits).toMatchObject({ balanceMinor: 65000, earnedMinor: 65000, pendingRewardsMinor: 0 });
    mine = (await t.call(student, "GET", API_ROUTES.referrals.myReferrals)).body as ReferralPage<ReferralItem>;
    expect(mine.items.find((r) => r.id === priya.id)?.convertedAt).not.toBeNull();
  });

  it("turns credits into a personal payment code only its owner can use, and back", async () => {
    const other = await active(UserRole.STUDENT);
    const plan = await t.prisma.plan.create({ data: { amount: 99900, code: "ref-plan", currency: "INR", name: "Monthly" } });

    expect((await t.call(student, "POST", API_ROUTES.referrals.myWithdrawals, { amountMinor: 50000, payoutDetails: "me@upi" })).status).toBe(403);
    expect((await t.call(student, "POST", API_ROUTES.referrals.myPaymentCodes, { amount: 10_000_000 })).status).toBe(400);
    const created = await t.call(student, "POST", API_ROUTES.referrals.myPaymentCodes, { amount: 30000 });
    expect(created.status).toBe(201);
    const { code, id } = created.body as { code: string; id: string };
    expect((await summary(student)).credits.balanceMinor).toBe(35000);

    const preview = (user: User) => t.call(user, "POST", API_ROUTES.payments.previewDiscount, { code, planId: plan.id });
    expect((await preview(student)).body).toMatchObject({ discountAmount: 30000, valid: true });
    expect((await preview(other)).body).toMatchObject({ reason: "NOT_FOUND", valid: false });
    const adminList = await t.call(admin, "GET", API_ROUTES.adminPayments.discounts);
    expect(JSON.stringify(adminList.body)).not.toContain(code);

    expect((await t.call(other, "POST", API_ROUTES.referrals.cancelPaymentCode(id))).status).toBe(404);
    expect((await t.call(student, "POST", API_ROUTES.referrals.cancelPaymentCode(id))).status).toBe(200);
    expect((await t.call(student, "POST", API_ROUTES.referrals.cancelPaymentCode(id))).status).toBe(409);
    expect((await summary(student)).credits.balanceMinor).toBe(65000);
  });

  it("gives the new member their benefits, and runs a points wallet: send, convert one way, pay fees", async () => {
    const coach = await active(UserRole.COACH);
    const rule = (body: Record<string, unknown>) => t.call(admin, "POST", API_ROUTES.adminReferrals.rewardRules, {
      autoApprove: true,
      isActive: true,
      kind: "PER_REFERRAL",
      roles: ["COACH"],
      ...body
    });
    // Shape rules: discounts only for the new member; a new member's benefit is per referral.
    expect((await rule({ amountMinor: 10, name: "x", stageId: "refstage_booked", unit: "DISCOUNT_PERCENT" })).status).toBe(400);
    expect((await rule({ amountMinor: 10, beneficiary: "REFERRED", kind: "MILESTONE", milestoneCount: 2, name: "x", stageId: "refstage_booked" })).status).toBe(400);
    expect((await rule({ amountMinor: 120, beneficiary: "REFERRED", name: "x", stageId: "refstage_booked", unit: "DISCOUNT_PERCENT" })).status).toBe(400);

    expect((await rule({ amountMinor: 500, name: "Coach points", stageId: "refstage_booked", unit: "POINTS" })).status).toBe(201);
    expect((await rule({ amountMinor: 200, beneficiary: "REFERRED", name: "Welcome points", stageId: "refstage_booked", unit: "POINTS" })).status).toBe(201);
    expect(
      (await rule({ amountMinor: 10, beneficiary: "REFERRED", discountValidDays: 30, maxDiscountMinor: 50000, name: "Welcome 10%", stageId: "refstage_converted", unit: "DISCOUNT_PERCENT" })).status
    ).toBe(201);

    // The landing page shows what the new member gets.
    const code = (await summary(coach)).code!;
    const visitor = browser();
    const visit = (await visitor("POST", API_ROUTES.referrals.visit, { code })).body as { benefits: { name: string }[] };
    expect(visit.benefits.map((b) => b.name).sort()).toEqual(["Welcome 10%", "Welcome points"]);
    await visitor("POST", API_ROUTES.leads.create, lead("Rohan Das", "9555512345"));
    expect((await summary(coach)).points).toMatchObject({ balance: 500, earned: 500 });

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
    expect((await summary(rohan)).points.balance).toBe(200);
    // Linking twice, or to the referrer, is refused.
    expect((await t.call(admin, "PUT", API_ROUTES.adminReferrals.linkUser(referral.id), { email: coach.email })).status).toBe(400);

    // Onboarded: the 10% welcome code is issued to Rohan only.
    await t.call(admin, "PATCH", API_ROUTES.adminReferrals.moveStage(referral.id), { stageId: "refstage_converted" });
    const welcome = await t.prisma.referralReward.findFirstOrThrow({ include: { discount: true }, where: { referrerId: rohan.id, unit: "DISCOUNT_PERCENT" } });
    expect(welcome.discount).toMatchObject({ maxDiscountAmount: 50000, restrictedToUserId: rohan.id, type: "PERCENTAGE", value: 10 });
    const rewards = (await t.call(rohan, "GET", API_ROUTES.referrals.myRewards)).body as { discountCode: string | null; discountStatus: string | null }[];
    expect(rewards.find((r) => r.discountCode)).toMatchObject({ discountCode: welcome.discount!.code, discountStatus: "ACTIVE" });

    // Points move between users; money never does (there is no route for it).
    await t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, {
      conversionPoints: 10,
      conversionValueMinor: 100,
      maxTransferPointsPerDay: 300,
      minConversionPoints: 50,
      minTransferPoints: 10
    });
    const send = (from: User, email: string, points: number) => t.call(from, "POST", API_ROUTES.referrals.transferPoints, { email, points });
    expect((await send(coach, coach.email, 50)).status).toBe(400); // to self
    expect((await send(coach, "nobody@example.com", 50)).status).toBe(404);
    expect((await send(coach, rohan.email, 5)).status).toBe(400); // under the minimum
    expect((await send(coach, rohan.email, 400)).status).toBe(400); // over the daily limit
    const sent = await send(coach, rohan.email, 250);
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ points: 250, pointsBalance: 250 });
    expect((await send(coach, rohan.email, 100)).status).toBe(400); // 250 + 100 > 300 today
    expect((await summary(rohan)).points.balance).toBe(450);

    // Points → money at 10 points = ₹1, one way.
    expect((await t.call(rohan, "POST", API_ROUTES.referrals.convertPoints, { points: 20 })).status).toBe(400); // under the minimum
    const converted = await t.call(rohan, "POST", API_ROUTES.referrals.convertPoints, { points: 150 });
    expect(converted.body).toEqual({ amountMinor: 1500, currency: "INR", points: 150 });
    let me = await summary(rohan);
    expect([me.points.balance, me.credits.balanceMinor]).toEqual([300, 1500]);

    // Points pay fees directly: 300 points → a ₹30 personal code; cancelling returns the points.
    const paid = await t.call(rohan, "POST", API_ROUTES.referrals.myPaymentCodes, { amount: 300, wallet: "POINTS" });
    expect(paid.body).toMatchObject({ amountMinor: 3000, points: 300, wallet: "POINTS" });
    expect((await summary(rohan)).points.balance).toBe(0);
    await t.call(rohan, "POST", API_ROUTES.referrals.cancelPaymentCode((paid.body as { id: string }).id));
    me = await summary(rohan);
    expect([me.points.balance, me.credits.balanceMinor]).toEqual([300, 1500]);

    // Parallel transfers never overspend.
    const parallel = await Promise.all(Array.from({ length: 4 }, () => send(rohan, coach.email, 100)));
    expect(parallel.filter((r) => r.status === 200).length).toBe(3);
    expect((await summary(rohan)).points.balance).toBe(0);

    // The admin ledger shows every movement; an admin can adjust points.
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.adjustCredits, { amountMinor: 75, note: "Goodwill", userId: rohan.id, wallet: "POINTS" })).status).toBe(200);
    expect((await summary(rohan)).points.balance).toBe(75);
    const ledger = (await t.call(admin, "GET", `${API_ROUTES.adminReferrals.ledger}?wallet=POINTS&userId=${rohan.id}&pageSize=50`)).body as ReferralPage<{ type: string; counterpartyName: string | null }>;
    expect(new Set(ledger.items.map((e) => e.type))).toEqual(
      new Set(["ADJUSTMENT", "POINTS_TRANSFER_OUT", "PAYMENT_CODE_REVERSAL", "PAYMENT_CODE", "CONVERSION_OUT", "POINTS_TRANSFER_IN", "REWARD"])
    );
    expect(ledger.items.find((e) => e.type === "POINTS_TRANSFER_IN")?.counterpartyName).toBe(`${coach.firstName} ${coach.lastName ?? ""}`.trim());
    expect((await t.call(student, "GET", API_ROUTES.adminReferrals.ledger)).status).toBe(403);

    // Switching transfers off closes the route.
    await t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, { pointsTransferEnabled: false });
    expect((await send(coach, rohan.email, 10)).status).toBe(403);
    await t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, { pointsTransferEnabled: true });
  });

  it("serialises withdrawals so the same credits are never paid twice", async () => {
    await t.call(admin, "PUT", API_ROUTES.adminReferrals.settings, { minWithdrawalMinor: 100 });
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.adjustCredits, { amountMinor: 20000, note: "Bonus", userId: sales.id })).status).toBe(200);

    // One call first, so the parallel ones below share an existing session row.
    await summary(sales);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => t.call(sales, "POST", API_ROUTES.referrals.myWithdrawals, { amountMinor: 20000, payoutDetails: "s@upi" }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400, 400, 400, 400]);
    expect((await summary(sales)).credits.balanceMinor).toBe(0);

    const withdrawal = await t.prisma.referralWithdrawal.findFirstOrThrow({ where: { userId: sales.id } });
    expect((await t.call(admin, "POST", API_ROUTES.adminReferrals.rejectWithdrawal(withdrawal.id), { adminNote: "Wrong UPI" })).status).toBe(200);
    expect((await summary(sales)).credits.balanceMinor).toBe(20000);
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
