import {
  API_ROUTES,
  markdownToPlainText,
  type PlatformTenantResponse,
  type SystemMessageListResponse,
  type TenantIntegrityRunsResponse,
  type TenantIntegrityRunSummary
} from "@nexa-chess/types";
import { NotificationType, UserRole, UserStatus } from "@prisma/client";
import { MailService } from "../../mail/mail.service";
import { createTestApp, type TestApp } from "../../test/integration/app";
import { createUser, resetDatabase } from "../../test/integration/db";
import { asPlatform, runInTenant } from "../tenant-context";
import { TenantIntegrityService } from "./tenant-integrity.service";

// Tenant integrity monitoring (docs/SAAS_MULTI_TENANCY.md "Tenant integrity
// monitoring"): finds rows linked across academies, allows platform-operator
// links, reports to operators. Monitoring only — the corruptions below are
// written with raw SQL, which is exactly what application isolation can't see.
describe("tenant integrity monitoring (real app, real Postgres)", () => {
  let t: TestApp;
  let service: TenantIntegrityService;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let rookId: string;
  let knightId: string;
  let seq = 0;

  const academy = async (slug: string, name: string, planCode = "GROWTH") => {
    const res = await t.call(operator, "POST", API_ROUTES.platform.tenants, {
      idempotencyKey: `integrity-${slug}-0001`,
      name,
      planCode,
      slug,
      superAdmin: { email: `owner@${slug}-integrity.int.test`, firstName: "Owner" }
    });
    expect(res.status).toBe(201);
    return (res.body as PlatformTenantResponse).tenant.id;
  };

  const userIn = (tenantId: string, role: UserRole) =>
    runInTenant(tenantId, "spec", () => {
      seq += 1;
      return t.prisma.user.create({
        data: { email: `integrity-${seq}@int.test`, firstName: `U${seq}`, password: "x", role, status: UserStatus.ACTIVE }
      });
    });

  const notificationFor = (tenantId: string, userId: string) =>
    runInTenant(tenantId, "spec", () =>
      t.prisma.notification.create({ data: { body: "b", title: "t", type: NotificationType.INVOICE_ISSUED, userId } })
    );

  const ownerOf = (slug: string) =>
    asPlatform("spec", async () =>
      t.prisma.user.update({
        data: { status: UserStatus.ACTIVE },
        where: { id: (await t.prisma.user.findFirstOrThrow({ where: { email: `owner@${slug}-integrity.int.test` } })).id }
      })
    );

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    service = t.app.get(TenantIntegrityService);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    // Creating academies from the console writes subscription events whose actor
    // is the operator (a Nexa user): the legitimate platform-operator link.
    rookId = await academy("rook", "Rook Academy");
    // Knight's plan includes messaging, for the system-message check at the end.
    knightId = await academy("knight", "Knight Academy", "BUSINESS");
  });

  afterAll(async () => {
    await t?.close();
  });

  it("walks every relationship between academy tables and finds nothing in correct data", async () => {
    const rookStudent = await userIn(rookId, UserRole.STUDENT);
    await notificationFor(rookId, rookStudent.id);
    const nexaStudent = await userIn("tenant_nexa", UserRole.STUDENT);
    await notificationFor("tenant_nexa", nexaStudent.id);

    const links = await service.discoverLinks();
    expect(links.length).toBeGreaterThan(250);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: "userId", parentTable: "users", table: "notifications" }),
        expect.objectContaining({ column: "actorUserId", parentTable: "users", table: "tenant_subscription_events" })
      ])
    );
    expect(links.every((link) => link.column !== "tenantId")).toBe(true);

    const result = await service.check();
    expect(result).toMatchObject({ errors: [], linksChecked: links.length, violations: [] });
  });

  it("allows a platform operator acting on an academy (subscription events), and nobody else", async () => {
    const events = await asPlatform("spec", () =>
      t.prisma.tenantSubscriptionEvent.findMany({ where: { actorUserId: operator.id } })
    );
    expect(events.map((event) => event.tenantId)).toEqual(expect.arrayContaining([rookId, knightId]));
    expect((await service.check()).violations).toEqual([]);

    // An academy admin of Knight recorded as the actor on Rook's subscription: not an operator.
    const knightOwner = await ownerOf("knight");
    const [rookEvent] = events.filter((event) => event.tenantId === rookId);
    await t.prisma.$executeRawUnsafe(
      `UPDATE "tenant_subscription_events" SET "actorUserId" = $1 WHERE "id" = $2`,
      knightOwner.id,
      rookEvent.id
    );
    const { violations } = await service.check();
    expect(violations).toEqual([
      expect.objectContaining({
        column: "actorUserId",
        count: 1,
        parentTable: "users",
        samples: [{ parentId: knightOwner.id, parentTenantId: knightId, rowKey: { id: rookEvent.id }, tenantId: rookId }],
        table: "tenant_subscription_events"
      })
    ]);
    await t.prisma.$executeRawUnsafe(
      `UPDATE "tenant_subscription_events" SET "actorUserId" = $1 WHERE "id" = $2`,
      operator.id,
      rookEvent.id
    );
  });

  it("reports an unexpected cross-academy link with its table, row ids and both academies", async () => {
    const rookStudent = await userIn(rookId, UserRole.STUDENT);
    const knightStudent = await userIn(knightId, UserRole.STUDENT);
    const nexaStudent = await userIn("tenant_nexa", UserRole.STUDENT);
    const toKnight = await notificationFor(rookId, rookStudent.id);
    const toNexa = await notificationFor(rookId, rookStudent.id);
    // Raw SQL skips the tenant-scope extension: the kind of slip monitoring is for.
    await t.prisma.$executeRawUnsafe(`UPDATE "notifications" SET "userId" = $1 WHERE "id" = $2`, knightStudent.id, toKnight.id);
    await t.prisma.$executeRawUnsafe(`UPDATE "notifications" SET "userId" = $1 WHERE "id" = $2`, nexaStudent.id, toNexa.id);

    const { violations } = await service.check();
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ column: "userId", count: 2, parentTable: "users", table: "notifications" });
    expect(violations[0].samples).toEqual(
      expect.arrayContaining([
        { parentId: knightStudent.id, parentTenantId: knightId, rowKey: { id: toKnight.id }, tenantId: rookId },
        { parentId: nexaStudent.id, parentTenantId: "tenant_nexa", rowKey: { id: toNexa.id }, tenantId: rookId }
      ])
    );
  });

  it("stores the run, alerts the operators and shows it in the console only to them", async () => {
    const mail = t.app.get(MailService);
    const send = jest.spyOn(mail, "sendRenderedSystemEmail").mockResolvedValue(undefined);

    const res = await t.call(operator, "POST", API_ROUTES.platform.integrityRuns);
    expect(res.status).toBe(200);
    const run = res.body as TenantIntegrityRunSummary;
    expect(run).toMatchObject({ status: "VIOLATIONS", trigger: "manual", violationCount: 2 });
    expect(run.finishedAt).not.toBeNull();

    // Email (on by default) to each operator, with the findings in the body and the report as the button.
    const toOperator = send.mock.calls.find(([to]) => to === operator.email);
    expect(toOperator).toBeDefined();
    const [, message] = toOperator!;
    expect(message.subject).toContain("2 cross-academy rows");
    // The body is formatted source (ids escaped for markdown); compare what a reader sees.
    expect(markdownToPlainText(message.body)).toContain("notifications.userId → users: 2 rows");
    expect(markdownToPlainText(message.body)).toContain(rookId);
    expect(message.action?.url).toMatch(/\/admin\/platform\?tab=integrity$/);
    // And in-app (on by default), opening the report.
    const inbox = await t.prisma.notification.findFirst({ where: { type: "SYSTEM_MESSAGE", userId: operator.id } });
    expect(inbox).toMatchObject({ linkPath: "/admin/platform?tab=integrity" });

    const listed = await t.call(operator, "GET", API_ROUTES.platform.integrityRuns);
    expect((listed.body as TenantIntegrityRunsResponse).runs[0]).toMatchObject({ id: run.id, status: "VIOLATIONS" });

    const rookOwner = await ownerOf("rook");
    const rookOrigin = { origin: "https://rook.nexachess.in" };
    expect((await t.call(rookOwner, "GET", API_ROUTES.platform.integrityRuns, undefined, rookOrigin)).status).toBe(403);
    expect((await t.call(rookOwner, "POST", API_ROUTES.platform.integrityRuns, undefined, rookOrigin)).status).toBe(403);
    const nexaAdmin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
    expect((await t.call(nexaAdmin, "GET", API_ROUTES.platform.integrityRuns)).status).toBe(403);
    send.mockRestore();
  });

  it("the nightly run takes the job lock and records a clean run once the data is fixed", async () => {
    await asPlatform("spec", () => t.prisma.notification.deleteMany({ where: { tenantId: rookId } }));
    await service.nightly();
    const latest = await asPlatform("spec", () => t.prisma.tenantIntegrityRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } }));
    expect(latest).toMatchObject({ status: "OK", trigger: "cron", violationCount: 0 });
  });

  it("the alert's wording is Nexa's: other academies' admins never see or edit it", async () => {
    const knightOwner = await ownerOf("knight");
    const knightOrigin = { origin: "https://knight.nexachess.in" };
    const knightList = await t.call(knightOwner, "GET", API_ROUTES.messaging.systemMessages, undefined, knightOrigin);
    expect(knightList.status).toBe(200);
    expect((knightList.body as SystemMessageListResponse).messages.map((m) => m.key)).not.toContain("TENANT_INTEGRITY_ALERT");
    const edit = await t.call(
      knightOwner,
      "PUT",
      API_ROUTES.messaging.systemMessage("TENANT_INTEGRITY_ALERT"),
      { actionLabel: "Open", body: "{{integrity.summary}}", channels: ["EMAIL"], subject: "x", whatsappBody: null },
      knightOrigin
    );
    expect(edit.status).toBe(404);

    const nexaList = await t.call(operator, "GET", API_ROUTES.messaging.systemMessages);
    expect((nexaList.body as SystemMessageListResponse).messages.map((m) => m.key)).toContain("TENANT_INTEGRITY_ALERT");
  });
});
