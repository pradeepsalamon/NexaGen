import { API_ROUTES, DEFAULT_TENANT_ID, type ChatConversationDetail } from "@nexa-chess/types";
import { EntitlementService } from "../platform/entitlement.service";
import { setTenantScopeModeForTesting } from "../prisma/tenant-scope.extension";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "./tenant-context";
import { TenantResolverService } from "./tenant-resolver.service";

// Nested writes get the academy too (tenant-scope extension `stampNested`).
// Before this, a second academy's chat members took the column default
// 'tenant_nexa' (labelled Nexa's), and after §D5 that default raises, so
// starting a chat would fail. Real app, real Postgres, enforce.
const ROOK = "tenant_int_nested";
const ORIGIN = "https://nested.int.test";

describe("nested writes carry the academy (real app, real Postgres, enforce)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    await t.prisma.tenant.create({ data: { id: ROOK, name: "Nested Academy", slug: "int-nested" } });
    await t.prisma.tenantDomain.create({ data: { hostname: "nested.int.test", isPrimary: true, kind: "CUSTOM", status: "ACTIVE", tenantId: ROOK } });
    await t.prisma.tenantSubscription.create({ data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: ROOK } });
    t.app.get(EntitlementService).invalidate();
    t.app.get(TenantResolverService).invalidate();
    setTenantScopeModeForTesting("enforce");
  }, 60_000);

  afterAll(async () => {
    setTenantScopeModeForTesting(null);
    await t?.close();
  });

  it("a direct chat's members (members: { create }) belong to the chat's academy", async () => {
    const world = await runInTenant(ROOK, "test: world", () => createWorld(t.prisma, { periodMonth: "2026-05", prefix: "N" }));
    const coach = { ...world.a.coach, tenantId: ROOK };
    const started = await t.call(coach, "POST", API_ROUTES.chat.startDirect, { userId: world.a.student.id }, { origin: ORIGIN });
    expect(started.status).toBeLessThan(300);
    const conversationId = (started.body as ChatConversationDetail).id;
    const members = await asPlatform("test: read members", () =>
      t.prisma.conversationMember.findMany({ select: { tenantId: true }, where: { conversationId } })
    );
    expect(members.length).toBe(2);
    expect(members.every((member) => member.tenantId === ROOK)).toBe(true);
    expect(members.some((member) => member.tenantId === DEFAULT_TENANT_ID)).toBe(false);
  });
});
