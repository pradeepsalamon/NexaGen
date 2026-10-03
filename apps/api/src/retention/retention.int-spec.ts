import { UserRole } from "@prisma/client";
import { JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { createUser, resetDatabase } from "../test/integration/db";
import { RetentionService } from "./retention.service";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("RetentionService (real Postgres)", () => {
  const prisma = new PrismaService();
  const service = new RetentionService(prisma, new JobLockService(prisma));
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
});
