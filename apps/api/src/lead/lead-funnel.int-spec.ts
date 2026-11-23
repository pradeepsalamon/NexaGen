import { API_ROUTES, DEFAULT_TENANT_ID, type LeadFunnelResponse } from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { runInTenant } from "../tenancy/tenant-context";

/** Admin Leads → Funnel over HTTP against real Postgres (docs/AD_MEASUREMENT.md "Funnel report"). */
describe("lead funnel report (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let coach: User;
  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:funnel", fn);

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.prisma.tenant.update({ data: { timezone: "Asia/Kolkata" }, where: { id: DEFAULT_TENANT_ID } });
    const active = async (role: UserRole) => {
      const user = await createUser(t.prisma, role);
      return db(() => t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } }));
    };
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
  });

  afterAll(async () => {
    await t?.close();
  });

  const lead = (createdAt: string, data: Record<string, unknown> = {}) =>
    db(() =>
      t.prisma.lead.create({
        data: { createdAt: new Date(createdAt), experienceLevel: "beginner", parentName: "P", phone: "9000000000", studentAge: 9, studentName: "K", ...data }
      })
    );

  it("counts leads of the academy's days by source and campaign, with how far each got", async () => {
    // 2026-11-10 in India runs from 2026-11-09T18:30Z to 2026-11-10T18:30Z.
    await lead("2026-11-09T18:29:00Z", { source: "instagram" }); // the 9th in India: outside
    await lead("2026-11-09T18:31:00Z", { campaign: "diwali", source: "instagram" });
    await lead("2026-11-10T10:00:00Z", { campaign: "diwali", source: "instagram", status: "DEMO_SCHEDULED" });
    await lead("2026-11-10T11:00:00Z", { campaign: "diwali", convertedAt: new Date("2026-11-12T00:00:00Z"), source: "instagram", status: "CONVERTED" });
    await lead("2026-11-10T12:00:00Z", { campaign: "Chess for kids", source: "WhatsApp ad", status: "DEMO_ATTENDED" });
    await lead("2026-11-10T18:31:00Z", { source: "Organic" }); // the 11th in India: outside

    const res = await t.call(admin, "GET", `${API_ROUTES.adminLeads.funnel}?from=2026-11-10&to=2026-11-10`);
    expect(res.status).toBe(200);
    const body = res.body as LeadFunnelResponse;
    expect(body.timeZone).toBe("Asia/Kolkata");
    expect(body.spend).toBeNull();
    expect(body.rows).toEqual([
      { campaign: "diwali", demoAttended: 0, demoBooked: 1, enrolled: 1, leads: 3, source: "instagram", spendMinor: null },
      { campaign: "Chess for kids", demoAttended: 1, demoBooked: 1, enrolled: 0, leads: 1, source: "WhatsApp ad", spendMinor: null }
    ]);
    expect(body.totals).toEqual({ demoAttended: 1, demoBooked: 2, enrolled: 1, leads: 4, spendMinor: null });
  });

  it("refuses coaches, bad dates and too long a range", async () => {
    expect((await t.call(coach, "GET", `${API_ROUTES.adminLeads.funnel}?from=2026-11-01&to=2026-11-02`)).status).toBe(403);
    expect((await t.call(admin, "GET", `${API_ROUTES.adminLeads.funnel}?from=2026-11-03&to=2026-11-02`)).status).toBe(400);
    expect((await t.call(admin, "GET", `${API_ROUTES.adminLeads.funnel}?from=nope&to=2026-11-02`)).status).toBe(400);
    expect((await t.call(admin, "GET", `${API_ROUTES.adminLeads.funnel}?from=2025-01-01&to=2026-11-02`)).status).toBe(400);
    expect((await t.call(null, "GET", `${API_ROUTES.adminLeads.funnel}?from=2026-11-01&to=2026-11-02`)).status).toBe(401);
  });
});
