import {
  API_ROUTES,
  type CoachPayrollRecordListResponse,
  type PayrollPeriodItem,
  type PayrollSettingsItem
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// TDS on coach pay (docs/FEATURES.md "Coach payroll: TDS"): off by default,
// an admin-set rate and yearly threshold, a coach's own rate, and the
// deduction worked out from what the record pays before TDS.
describe("coach payroll TDS (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let coach: Awaited<ReturnType<typeof createUser>>;
  let exempt: Awaited<ReturnType<typeof createUser>>;

  const call = (method: string, path: string, body?: unknown) => t.call(admin, method, path, body);

  async function runPeriod(startDate: string, endDate: string) {
    const created = await call("POST", API_ROUTES.adminPayroll.periods, { endDate, periodType: "MONTHLY", startDate });
    expect(created.status).toBe(201);
    const period = (created.body as { period: PayrollPeriodItem }).period;
    expect((await call("POST", API_ROUTES.adminPayroll.calculatePeriod(period.id))).status).toBe(201);
    return period;
  }

  async function recordsOf(periodId: string) {
    const list = await call("GET", `${API_ROUTES.adminPayroll.records}?periodId=${periodId}`);
    return (list.body as CoachPayrollRecordListResponse).records;
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const active = async (role: UserRole) =>
      t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    exempt = await active(UserRole.COACH);

    // ₹30,000 a month each, fixed salary.
    for (const [user, profile] of [
      [coach, {}],
      [exempt, { tdsRateBps: 0 }]
    ] as const) {
      const saved = await call("PUT", API_ROUTES.adminPayroll.compensationProfile(user.id), {
        defaultCompensationModel: "FIXED_SALARY",
        ...profile
      });
      expect(saved.status).toBe(200);
      const rate = await call("POST", API_ROUTES.adminPayroll.compensationRates(user.id), {
        calculationType: "MONTHLY_SALARY",
        compensationModel: "FIXED_SALARY",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        rateMinor: 3_000_000
      });
      expect(rate.status).toBe(201);
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  it("is off until an admin turns it on", async () => {
    const settings = (await call("GET", API_ROUTES.adminPayroll.settings)).body as { settings: PayrollSettingsItem };
    expect(settings.settings).toMatchObject({ financialYearStartMonth: 4, tdsEnabled: false, tdsRateBps: 0 });

    const april = await runPeriod("2026-04-01", "2026-05-01");
    const [record] = (await recordsOf(april.id)).filter((r) => r.coachId === coach.id);
    expect(record).toMatchObject({ grossEarningsMinor: 3_000_000, netPayableMinor: 3_000_000, tds: null, tdsMinor: 0 });
  });

  it("refuses a rate over 100% and a coach changing the settings", async () => {
    expect((await call("PUT", API_ROUTES.adminPayroll.settings, { tdsRateBps: 10_001 })).status).toBe(400);
    expect((await call("PUT", API_ROUTES.adminPayroll.settings, {})).status).toBe(400);
    expect((await t.call(coach, "PUT", API_ROUTES.adminPayroll.settings, { tdsEnabled: true })).status).toBe(403);
    expect((await t.call(coach, "GET", API_ROUTES.adminPayroll.settings)).status).toBe(403);
  });

  it("deducts on the whole year's pay once it goes above the threshold, and never for an exempt coach", async () => {
    const saved = await call("PUT", API_ROUTES.adminPayroll.settings, {
      tdsEnabled: true,
      tdsRateBps: 1000,
      tdsThresholdMinor: 5_000_000
    });
    expect((saved.body as { settings: PayrollSettingsItem }).settings).toMatchObject({
      tdsEnabled: true,
      tdsRateBps: 1000,
      tdsThresholdMinor: 5_000_000
    });

    // May: ₹30,000 in April (no TDS) + ₹30,000 now = ₹60,000, above ₹50,000 → 10% of ₹60,000.
    const may = await runPeriod("2026-05-01", "2026-06-01");
    const records = await recordsOf(may.id);
    const mine = records.find((r) => r.coachId === coach.id);
    expect(mine).toMatchObject({
      grossEarningsMinor: 3_000_000,
      netPayableMinor: 2_400_000,
      tds: { priorTaxableMinor: 3_000_000, priorTdsMinor: 0, rateBps: 1000, thresholdMinor: 5_000_000, yearStart: "2026-04-01" },
      tdsMinor: 600_000
    });
    expect(records.find((r) => r.coachId === exempt.id)).toMatchObject({ netPayableMinor: 3_000_000, tds: null, tdsMinor: 0 });

    // An adjustment changes what the record pays, so its TDS follows.
    const adjusted = await call("POST", API_ROUTES.adminPayroll.adjustments(mine!.id), {
      amountMinor: 1_000_000,
      description: "Tournament duty",
      reason: "Extra day",
      type: "EARNING"
    });
    expect(adjusted.status).toBe(201);
    const afterAdjustment = (await recordsOf(may.id)).find((r) => r.coachId === coach.id);
    expect(afterAdjustment).toMatchObject({ netPayableMinor: 3_300_000, tdsMinor: 700_000, totalAdjustmentsMinor: 1_000_000 });

    // June: only this month's 10% is left to deduct.
    const june = await runPeriod("2026-06-01", "2026-07-01");
    expect((await recordsOf(june.id)).find((r) => r.coachId === coach.id)).toMatchObject({
      netPayableMinor: 2_700_000,
      tds: { priorTaxableMinor: 7_000_000, priorTdsMinor: 700_000 },
      tdsMinor: 300_000
    });
  });

  it("starts again in a new financial year", async () => {
    const nextApril = await runPeriod("2027-04-01", "2027-05-01");
    expect((await recordsOf(nextApril.id)).find((r) => r.coachId === coach.id)).toMatchObject({
      netPayableMinor: 3_000_000,
      tds: { priorTaxableMinor: 0, yearStart: "2027-04-01" },
      tdsMinor: 0
    });
  });
});
