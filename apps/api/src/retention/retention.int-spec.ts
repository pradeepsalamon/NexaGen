import { JwtService } from "@nestjs/jwt";
import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { RetentionPolicyService } from "./retention-policy.service";
import { RetentionService } from "./retention.service";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("RetentionService (real Postgres)", () => {
  const prisma = new PrismaService();
  const policies = new RetentionPolicyService(new JwtService(), prisma);
  const service = new RetentionService(prisma, new JobLockService(prisma), policies);
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it("deletes only rows past their cutoff, whatever the session time zone", async () => {
    const user = await createUser(prisma, UserRole.STUDENT);
    const session = (expiresAt: Date) =>
      prisma.authSession.create({ data: { expiresAt, refreshTokenHash: "h", userId: user.id } });
    // The DB runs in Asia/Kolkata here, so a +5:30 shift would flip both of these.
    const expiredLongAgo = await session(ago(2));
    const expiredRecently = await session(new Date(now.getTime() - DAY_MS + 60 * 60 * 1000));
    const live = await session(new Date(now.getTime() + DAY_MS));

    await prisma.passwordResetToken.create({ data: { expiresAt: ago(3), tokenHash: "old", userId: user.id } });
    await prisma.passwordResetToken.create({ data: { expiresAt: ago(-1), tokenHash: "new", userId: user.id } });
    await prisma.processedWebhookEvent.create({ data: { eventType: "x", id: "old", processedAt: ago(31) } });
    await prisma.processedWebhookEvent.create({ data: { eventType: "x", id: "new", processedAt: ago(29) } });

    const deleted = await service.pruneAll(now);

    const remaining = (await prisma.authSession.findMany({ select: { id: true } })).map((s) => s.id).sort();
    expect(remaining).toEqual([expiredRecently.id, live.id].sort());
    expect(remaining).not.toContain(expiredLongAgo.id);
    expect(await prisma.passwordResetToken.findMany({ select: { tokenHash: true } })).toEqual([{ tokenHash: "new" }]);
    expect(await prisma.processedWebhookEvent.findMany({ select: { id: true } })).toEqual([{ id: "new" }]);
    expect(deleted).toMatchObject({ auth_sessions: 1, password_reset_tokens: 1, processed_webhook_events: 1 });
  });

  it("keeps an old visitor session that a lead links to", async () => {
    await prisma.$executeRaw`
      INSERT INTO "visitor_sessions" ("id", "sessionId", "visitorId", "firstVisit", "lastVisit")
      VALUES ('orphan', 's1', 'v1', ${ago(400).toISOString()}::timestamp, ${ago(200).toISOString()}::timestamp),
             ('linked', 's2', 'v2', ${ago(400).toISOString()}::timestamp, ${ago(200).toISOString()}::timestamp),
             ('recent', 's3', 'v3', ${ago(10).toISOString()}::timestamp, ${ago(10).toISOString()}::timestamp)`;
    await prisma.lead.create({
      data: {
        experienceLevel: "BEGINNER",
        parentName: "Parent",
        phone: "9876543210",
        studentAge: 9,
        studentName: "Student",
        visitorSessionId: "linked"
      }
    });

    await service.pruneAll(now);

    const remaining = (await prisma.visitorSession.findMany({ select: { id: true } })).map((v) => v.id).sort();
    expect(remaining).toEqual(["linked", "recent"]);
  });

  describe("admin-set windows", () => {
    const seed = async () => {
      const user = await createUser(prisma, UserRole.STUDENT);
      const conversation = await prisma.conversation.create({ data: { type: "GROUP", name: "g" } });
      const chat = (id: string, days: number) =>
        prisma.chatMessage.create({ data: { body: id, conversationId: conversation.id, createdAt: ago(days), id, senderId: user.id } });
      await chat("chat-old", 40);
      await chat("chat-new", 20);
      const notify = (id: string, days: number) =>
        prisma.notification.create({
          data: { body: "b", createdAt: ago(days), id, title: "t", type: "ASSIGNMENT_GRADED", userId: user.id }
        });
      await notify("n-old", 40);
      await notify("n-new", 20);
      const delivery = (id: string, days: number, status: "PENDING" | "SENT" | "FAILED") =>
        prisma.messageDelivery.create({
          data: { body: "b", channel: "IN_APP", createdAt: ago(days), event: "ANNOUNCEMENT", id, status }
        });
      await delivery("d-old-sent", 40, "SENT");
      await delivery("d-old-failed", 40, "FAILED");
      await delivery("d-old-pending", 40, "PENDING");
      await delivery("d-new", 20, "SENT");
      const event = (id: string, days: number) =>
        prisma.analyticsEvent.create({ data: { id, occurredAt: ago(days), type: "LOGIN", userId: user.id } });
      await event("e-old", 100);
      await event("e-new", 80);
      return user;
    };
    const ids = async () => ({
      chat: (await prisma.chatMessage.findMany({ select: { id: true } })).map((r) => r.id).sort(),
      deliveries: (await prisma.messageDelivery.findMany({ select: { id: true } })).map((r) => r.id).sort(),
      events: (await prisma.analyticsEvent.findMany({ select: { id: true } })).map((r) => r.id).sort(),
      notifications: (await prisma.notification.findMany({ select: { id: true } })).map((r) => r.id).sort()
    });

    it("keeps everything while no window is set", async () => {
      await seed();
      await service.pruneAll(now);
      expect(await ids()).toEqual({
        chat: ["chat-new", "chat-old"],
        deliveries: ["d-new", "d-old-failed", "d-old-pending", "d-old-sent"],
        events: ["e-new", "e-old"],
        notifications: ["n-new", "n-old"]
      });
    });

    it("deletes past each window, never a queued delivery, and records the run", async () => {
      await seed();
      await prisma.retentionPolicy.createMany({
        data: [
          { category: "CHAT_MESSAGES", days: 30 },
          { category: "NOTIFICATIONS", days: 30 },
          { category: "MESSAGE_DELIVERIES", days: 30 },
          { category: "ANALYTICS_EVENTS", days: 90 },
          { category: "LIVE_CHAT_MESSAGES", days: null }
        ]
      });

      const deleted = await service.pruneAll(now);

      expect(await ids()).toEqual({
        chat: ["chat-new"],
        deliveries: ["d-new", "d-old-pending"],
        events: ["e-new"],
        notifications: ["n-new"]
      });
      expect(deleted).toMatchObject({ analytics_events: 1, chat_messages: 1, message_deliveries: 2, notifications: 1 });
      expect(deleted.live_chat_messages).toBeUndefined();
      const chatPolicy = await prisma.retentionPolicy.findUniqueOrThrow({ where: { category: "CHAT_MESSAGES" } });
      expect(chatPolicy).toMatchObject({ changedAt: null, lastDeletedCount: 1 });
      expect(chatPolicy.lastSweptAt?.toISOString()).toBe(now.toISOString());
    });
  });
});

describe("Data retention routes (real app, real Postgres)", () => {
  let t: TestApp;
  let superAdmin: User;

  const active = async (role: UserRole) =>
    t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    superAdmin = await active(UserRole.SUPER_ADMIN);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("lets a super admin set, preview and clear a window", async () => {
    const list = await t.call(superAdmin, "GET", API_ROUTES.adminRetention.policies);
    expect(list.status).toBe(200);
    expect((list.body as { policies: { days: null }[] }).policies).toHaveLength(5);

    const preview = await t.call(superAdmin, "GET", `${API_ROUTES.adminRetention.preview("CHAT_MESSAGES")}?days=365`);
    expect(preview).toMatchObject({ body: { eligibleCount: 0 }, status: 200 });

    const set = await t.call(superAdmin, "PUT", API_ROUTES.adminRetention.policy("CHAT_MESSAGES"), { days: 365 });
    expect(set).toMatchObject({ body: { days: 365, eligibleCount: 0 }, status: 200 });
    expect((set.body as { updatedByName: string }).updatedByName).toBe(superAdmin.firstName);

    const off = await t.call(superAdmin, "PUT", API_ROUTES.adminRetention.policy("CHAT_MESSAGES"), { days: null });
    expect(off).toMatchObject({ body: { days: null }, status: 200 });
  });

  it("answers 400 for a window below the minimum or an unknown category", async () => {
    const low = await t.call(superAdmin, "PUT", API_ROUTES.adminRetention.policy("ANALYTICS_EVENTS"), { days: 30 });
    expect(low.status).toBe(400);
    const unknown = await t.call(superAdmin, "PUT", API_ROUTES.adminRetention.policy("PASSWORDS"), { days: 30 });
    expect(unknown.status).toBe(400);
    const badQuery = await t.call(superAdmin, "GET", `${API_ROUTES.adminRetention.preview("CHAT_MESSAGES")}?days=x`);
    expect(badQuery.status).toBe(400);
  });

  it("refuses a plain admin", async () => {
    const admin = await active(UserRole.ADMIN);
    const res = await t.call(admin, "PUT", API_ROUTES.adminRetention.policy("CHAT_MESSAGES"), { days: 365 });
    expect(res.status).toBe(403);
    expect(await t.prisma.retentionPolicy.count()).toBe(0);
  });
});
