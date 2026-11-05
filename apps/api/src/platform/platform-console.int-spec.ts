import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type AuthResponse,
  type ContentPacksResponse,
  type PlatformTenantResponse,
  type PlatformTenantSubscriptionResponse,
  type StartSupportSessionResponse
} from "@nexa-chess/types";
import { PuzzleDifficulty, PuzzleStatus, PuzzleType, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { EntitlementService } from "./entitlement.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";

// Phase 4c–4f (docs/SAAS_MULTI_TENANCY.md § "Phase 4 plan").
describe("platform console: plans, subscriptions, support, packs (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let tenantId: string;
  const ACADEMY_ORIGIN = "https://pawn.nexachess.in";

  const op = (method: string, path: string, body?: unknown) => t.call(operator, method, path, body);
  const sub = async () =>
    (await op("GET", API_ROUTES.platform.tenantSubscription(tenantId))).body as PlatformTenantSubscriptionResponse;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    const created = await op("POST", API_ROUTES.platform.tenants, {
      idempotencyKey: "console-pawn-0001",
      name: "Pawn Academy",
      planCode: "GROWTH",
      slug: "pawn",
      superAdmin: { email: "owner@pawn.int.test", firstName: "Pia" }
    });
    tenantId = (created.body as PlatformTenantResponse).tenant.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it("editing a plan leaves existing subscriptions on their version until applied", async () => {
    const plans = (await op("GET", API_ROUTES.platform.plans)).body as { plans: Array<{ code: string; id: string; version: number }> };
    const growth = plans.plans.find((plan) => plan.code === "GROWTH")!;
    const before = await sub();
    const edited = await op("PATCH", API_ROUTES.platform.plan(growth.id), {
      limits: { maxBatches: 1, maxCoaches: 1, maxConcurrentLiveClasses: 1, maxStudents: 1 }
    });
    expect(edited.status).toBe(200);
    t.app.get(EntitlementService).invalidate();
    const after = await sub();
    expect(after.limits).toEqual(before.limits);
    expect(after.deal?.planVersion).toBe(growth.version);
    expect(after.deal?.currentPlanVersion).toBe(growth.version + 1);

    const applied = await op("POST", API_ROUTES.platform.planApplyToExisting(growth.id));
    expect((applied.body as { updated: number }).updated).toBeGreaterThanOrEqual(1);
    t.app.get(EntitlementService).invalidate();
    expect((await sub()).limits.maxStudents).toBe(1);
  });

  it("a deal save without lapse fields keeps the academy's lapse override; {} clears it", async () => {
    const deal = (lapse: unknown, customPriceMinor: number | null) =>
      op("PUT", API_ROUTES.platform.tenantDeal(tenantId), {
        customPriceMinor,
        lapse,
        note: null,
        overrides: { addFeatures: [], limits: {}, removeFeatures: [] }
      });
    const planDefault = (await sub()).deal?.lapse;
    expect((await deal({ graceDays: 3, pastDueDays: 2 }, null)).status).toBe(200);
    expect((await sub()).deal?.lapse).toMatchObject({ graceDays: 3, pastDueDays: 2 });
    // The console's deal dialog sends lapse: null with a price edit.
    expect((await deal(null, 150000)).status).toBe(200);
    const kept = await sub();
    expect(kept.deal?.lapse).toMatchObject({ graceDays: 3, pastDueDays: 2 });
    expect(kept.deal?.customPriceMinor).toBe(150000);
    expect((await deal({}, null)).status).toBe(200);
    expect((await sub()).deal?.lapse).toEqual(planDefault);
  });

  it("refuses a disallowed transition and allows the §G ones", async () => {
    // GROWTH has a trial: TRIALING → GRACE is not allowed.
    const bad = await op("POST", API_ROUTES.platform.tenantTransition(tenantId), { note: "Try grace", status: "GRACE" });
    expect(bad.status).toBe(409);
    const good = await op("POST", API_ROUTES.platform.tenantTransition(tenantId), { note: "Paid by bank", status: "ACTIVE" });
    expect((good.body as PlatformTenantSubscriptionResponse).subscription?.status).toBe("ACTIVE");
  });

  it("records a manual payment, and the sweep walks a lapsed period to grace then expired", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const paid = await op("POST", API_ROUTES.platform.tenantPayments(tenantId), {
      amountMinor: 499_900,
      currentPeriodEnd: future,
      note: "NEFT",
      reference: "UTR123"
    });
    expect((paid.body as PlatformTenantSubscriptionResponse).payments[0]).toMatchObject({ amountMinor: 499_900, reference: "UTR123" });

    const sweeper = t.app.get(PlatformSubscriptionsService);
    const day = 86_400_000;
    const periodEnd = Date.now() + 30 * day;
    await sweeper.sweep(new Date(periodEnd + 1_000));
    expect((await sub()).subscription?.status).toBe("PAST_DUE");
    await sweeper.sweep(new Date(periodEnd + 8 * day));
    const grace = await sub();
    expect(grace.subscription?.status).toBe("GRACE");
    await sweeper.sweep(new Date(new Date(grace.subscription!.graceEndsAt!).getTime() + 1_000));
    expect((await sub()).subscription?.status).toBe("EXPIRED");
    // Resubscribe.
    await op("POST", API_ROUTES.platform.tenantPayments(tenantId), { amountMinor: 1, currentPeriodEnd: future, note: "Back" });
    expect((await sub()).subscription?.status).toBe("ACTIVE");
  });

  it("a support visit signs in on the academy's host once, as its support user, and is logged", async () => {
    const started = await op("POST", API_ROUTES.platform.tenantSupport(tenantId), { reason: "Ticket 42: batch missing" });
    const { enterUrl, id } = started.body as StartSupportSessionResponse;
    const token = new URL(enterUrl).searchParams.get("token")!;
    expect(new URL(enterUrl).host).toBe("pawn.nexachess.in");

    const enter = (origin: string) =>
      fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.auth.supportEnter}`, {
        body: JSON.stringify({ token }),
        headers: { "Content-Type": "application/json", Origin: origin },
        method: "POST"
      });
    // Not on another academy's host.
    expect((await enter("http://localhost:3000")).status).toBe(401);
    const res = await enter(ACADEMY_ORIGIN);
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect((await enter(ACADEMY_ORIGIN)).status).toBe(401); // once only

    const me = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.auth.me}`, {
      headers: { Cookie: cookie, Origin: ACADEMY_ORIGIN }
    });
    const body = (await me.json()) as AuthResponse;
    expect(body.user.email).toBe(`support+${tenantId}@platform.invalid`);
    expect(body.support).toMatchObject({ id, reason: "Ticket 42: batch missing" });

    // A write during the visit is counted; the academy's super admin sees the visit.
    await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.batches.create}`, {
      body: JSON.stringify({ name: "Support-made batch" }),
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ACADEMY_ORIGIN },
      method: "POST"
    });
    const visit = await asPlatform("spec", () => t.prisma.platformSupportSession.findUniqueOrThrow({ where: { id } }));
    expect(visit.actionCount).toBe(1);

    const owner = await asPlatform("spec", () => t.prisma.user.findFirstOrThrow({ where: { email: "owner@pawn.int.test" } }));
    const history = await t.call(owner, "GET", API_ROUTES.subscription.supportVisits, undefined, { origin: ACADEMY_ORIGIN });
    expect((history.body as { sessions: Array<{ id: string }> }).sessions.map((row) => row.id)).toContain(id);

    // Ending it revokes the sign-in at once.
    await op("POST", API_ROUTES.platform.supportSessionEnd(id));
    const after = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.auth.me}`, {
      headers: { Cookie: cookie, Origin: ACADEMY_ORIGIN }
    });
    expect(after.status).toBe(401);
  });

  it("content packs: only a published pack in the plan reaches the academy, and a copy is the academy's own", async () => {
    const folder = await runInTenant(DEFAULT_TENANT_ID, "spec", () =>
      t.prisma.puzzleTopic.create({ data: { name: "Nexa mates", slug: "nexa-mates" } })
    );
    await runInTenant(DEFAULT_TENANT_ID, "spec", async () => {
      for (const [title, visibility] of [["Published", PuzzleVisibility.GLOBAL], ["Coach private", PuzzleVisibility.PRIVATE]] as const) {
        await t.prisma.puzzle.create({
          data: {
            createdByRole: UserRole.ADMIN,
            difficulty: PuzzleDifficulty.EASY,
            fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
            puzzleType: PuzzleType.CHECKMATE,
            solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
            status: PuzzleStatus.PUBLISHED,
            title,
            topicId: folder.id,
            visibility
          }
        });
      }
    });
    const packRes = await op("POST", API_ROUTES.platform.contentPacks, { name: "Mates pack" });
    const packId = (packRes.body as { pack: { id: string } }).pack.id;
    const withItem = await op("POST", API_ROUTES.platform.contentPackItems(packId), { kind: "PUZZLE_FOLDER", sourceId: folder.id });
    const itemId = (withItem.body as { pack: { items: Array<{ id: string; puzzleCount: number }> } }).pack.items[0];
    expect(itemId.puzzleCount).toBe(1);

    const owner = await asPlatform("spec", () => t.prisma.user.findFirstOrThrow({ where: { email: "owner@pawn.int.test" } }));
    const asOwner = (method: string, path: string) => t.call(owner, method, path, undefined, { origin: ACADEMY_ORIGIN });

    // Not in the plan, then in the plan but unpublished: invisible.
    expect(((await asOwner("GET", API_ROUTES.subscription.contentPacks)).body as ContentPacksResponse).packs).toEqual([]);
    const subRow = await asPlatform("spec", () => t.prisma.tenantSubscription.findUniqueOrThrow({ where: { tenantId } }));
    await asPlatform("spec", () =>
      t.prisma.tenantSubscription.update({ data: { overrides: { addContentPacks: [packId] } }, where: { id: subRow.id } })
    );
    expect(((await asOwner("GET", API_ROUTES.subscription.contentPacks)).body as ContentPacksResponse).packs).toEqual([]);
    expect((await asOwner("GET", API_ROUTES.subscription.contentPackFolder(packId, itemId.id))).status).toBe(404);

    await op("PUT", API_ROUTES.platform.contentPack(packId), { isPublished: true, name: "Mates pack" });
    const folderRes = await asOwner("GET", API_ROUTES.subscription.contentPackFolder(packId, itemId.id));
    expect((folderRes.body as { puzzles: Array<{ title: string }> }).puzzles.map((puzzle) => puzzle.title)).toEqual(["Published"]);

    const copy = await asOwner("POST", API_ROUTES.subscription.contentPackFolderCopy(packId, itemId.id));
    const { copied, topicId } = copy.body as { copied: number; topicId: string };
    expect(copied).toBe(1);
    const copiedRows = await asPlatform("spec", () => t.prisma.puzzle.findMany({ where: { topicId } }));
    expect(copiedRows.map((row) => [row.tenantId, row.title])).toEqual([[tenantId, "Published"]]);

    // The plan can carry the pack instead of the deal.
    await asPlatform("spec", () =>
      t.prisma.tenantSubscription.update({ data: { overrides: {} }, where: { id: subRow.id } })
    );
    const plans = (await op("GET", API_ROUTES.platform.plans)).body as { plans: Array<{ code: string; id: string }> };
    const planId = plans.plans.find((plan) => plan.code === subRow.planId || plan.id === subRow.planId)!.id;
    const patched = await op("PATCH", API_ROUTES.platform.plan(planId), { contentPackIds: [packId] });
    expect((patched.body as { plan: { contentPackIds: string[] } }).plan.contentPackIds).toEqual([packId]);
    const viaPlan = (await asOwner("GET", API_ROUTES.subscription.contentPacks)).body as ContentPacksResponse;
    expect(viaPlan.packs.map((pack) => pack.id)).toEqual([packId]);
  });

  it("marks only Nexa's super admin as a platform operator on /auth/me", async () => {
    const me = await op("GET", API_ROUTES.auth.me);
    expect((me.body as AuthResponse).user.isPlatformOperator).toBe(true);
    const owner = await asPlatform("spec", () => t.prisma.user.findFirstOrThrow({ where: { email: "owner@pawn.int.test" } }));
    const theirs = await t.call(owner, "GET", API_ROUTES.auth.me, undefined, { origin: ACADEMY_ORIGIN });
    expect((theirs.body as AuthResponse).user.isPlatformOperator).toBe(false);
    const list = await op("GET", API_ROUTES.platform.tenants);
    expect((list.body as { rootDomain: string }).rootDomain).toBe("nexachess.in");
  });
});
