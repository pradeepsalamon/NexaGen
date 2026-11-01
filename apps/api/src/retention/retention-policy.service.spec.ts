import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import * as authenticate from "../auth/authenticate";
import type { PrismaService } from "../prisma/prisma.service";
import { RetentionPolicyService } from "./retention-policy.service";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));

const authenticateUser = authenticate.authenticateUser as jest.Mock;

function createService() {
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string, ..._params: unknown[]) =>
      sql.startsWith("SELECT count") ? [{ count: BigInt(42) }] : [{ oldest: new Date("2025-01-01T00:00:00.000Z") }]
    ),
    retentionPolicy: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        lastDeletedCount: null,
        lastSweptAt: null,
        updatedBy: { firstName: "Sam", lastName: "Admin" }
      }))
    }
  };
  const service = new RetentionPolicyService({} as JwtService, prisma as unknown as PrismaService);
  return { prisma, service };
}

describe("RetentionPolicyService", () => {
  const now = new Date("2026-10-31T10:00:00.000Z");

  beforeEach(() => {
    authenticateUser.mockResolvedValue({ id: "super", role: UserRole.SUPER_ADMIN });
  });

  it.each([UserRole.ADMIN, UserRole.COACH, UserRole.STUDENT])("refuses %s", async (role) => {
    authenticateUser.mockResolvedValue({ id: "u", role });
    const { service } = createService();
    await expect(service.list("t")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update("t", "CHAT_MESSAGES", { days: 365 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.preview("t", "CHAT_MESSAGES", { days: 365 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists every category as kept forever until one is set", async () => {
    const { service } = createService();
    const res = await service.list("t", now);

    expect(res.policies.map((p) => p.category).sort()).toEqual(
      ["ANALYTICS_EVENTS", "CHAT_MESSAGES", "LIVE_CHAT_MESSAGES", "MESSAGE_DELIVERIES", "NOTIFICATIONS"]
    );
    expect(res.policies.every((p) => p.days === null && p.eligibleCount === null)).toBe(true);
    expect(res.policies[0].oldestRecordAt).toBe("2025-01-01T00:00:00.000Z");
    expect(res.nextSweepAt).toBe("2026-11-01T04:00:00.000Z");
    expect(res.fixedRules.length).toBeGreaterThan(0);
  });

  it("rejects a window below the category minimum", async () => {
    const { prisma, service } = createService();
    await expect(service.update("t", "ANALYTICS_EVENTS", { days: 30 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.preview("t", "CHAT_MESSAGES", { days: 7 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.retentionPolicy.upsert).not.toHaveBeenCalled();
  });

  it("saves a window with who changed it and counts what it would delete", async () => {
    const { prisma, service } = createService();
    const item = await service.update("t", "CHAT_MESSAGES", { days: 365 }, now);

    expect(prisma.retentionPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { category: "CHAT_MESSAGES", changedAt: now, days: 365, updatedById: "super" },
        where: { category: "CHAT_MESSAGES" }
      })
    );
    expect(item).toMatchObject({ days: 365, eligibleCount: 42, updatedByName: "Sam Admin" });
    const [, cutoff] = prisma.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).startsWith("SELECT count")) ?? [];
    // Measured from the next sweep (2026-11-01 04:00 UTC), not the request.
    expect(cutoff).toBe("2025-11-01T04:00:00.000Z");
  });

  it("turns a window off with null", async () => {
    const { service } = createService();
    const item = await service.update("t", "NOTIFICATIONS", { days: null }, now);
    expect(item).toMatchObject({ days: null, eligibleCount: null });
  });

  it("previews the cutoff and count without saving", async () => {
    const { prisma, service } = createService();
    const res = await service.preview("t", "NOTIFICATIONS", { days: 90 }, now);
    expect(res).toEqual({ category: "NOTIFICATIONS", cutoff: "2026-08-03T04:00:00.000Z", days: 90, eligibleCount: 42 });
    expect(prisma.retentionPolicy.upsert).not.toHaveBeenCalled();
  });

  it("skips a stored window below the minimum instead of applying it", async () => {
    const { prisma, service } = createService();
    prisma.retentionPolicy.findMany.mockResolvedValue([
      { category: "CHAT_MESSAGES", days: 3 },
      { category: "NOTIFICATIONS", days: 90 }
    ]);
    const rules = await service.activeRules();
    expect(rules).toEqual([
      { category: "NOTIFICATIONS", rule: { column: "createdAt", days: 90, table: "notifications" } }
    ]);
  });
});
