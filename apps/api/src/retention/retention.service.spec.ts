import type { RetentionCategory } from "@nexa-chess/types";
import type { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import type { PrismaService } from "../prisma/prisma.service";
import type { RetentionPolicyService } from "./retention-policy.service";
import {
  RETENTION_BATCH_SIZE,
  RETENTION_CATEGORY_TARGETS,
  RETENTION_RULES,
  nextRetentionSweep,
  type RetentionRule
} from "./retention.rules";
import { RetentionService } from "./retention.service";

type Active = { category: RetentionCategory; rule: RetentionRule }[];

function createService(executeRawUnsafe: jest.Mock, active: Active = []) {
  const prisma = { $executeRawUnsafe: executeRawUnsafe } as unknown as PrismaService;
  const policies = {
    activeRules: jest.fn().mockResolvedValue(active),
    recordSweep: jest.fn().mockResolvedValue(undefined)
  };
  const service = new RetentionService(
    prisma,
    createJobLockStub() as unknown as JobLockService,
    policies as unknown as RetentionPolicyService
  );
  return { policies, service };
}

describe("RetentionService", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("binds the cutoff as naive-UTC ISO text, never a Date", async () => {
    const execute = jest.fn().mockResolvedValue(0);
    await createService(execute).service.pruneAll(now);

    const [sql, cutoff] = execute.mock.calls[0];
    expect(sql).toContain(`"auth_sessions"`);
    expect(sql).toContain("$1::timestamp");
    expect(cutoff).toBe("2026-10-02T12:00:00.000Z");
  });

  it("keeps deleting in batches until a batch comes back short", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(RETENTION_BATCH_SIZE)
      .mockResolvedValueOnce(RETENTION_BATCH_SIZE)
      .mockResolvedValueOnce(12)
      .mockResolvedValue(0);

    const deleted = await createService(execute).service.pruneAll(now);

    expect(deleted.auth_sessions).toBe(RETENTION_BATCH_SIZE * 2 + 12);
    expect(execute).toHaveBeenCalledTimes(3 + RETENTION_RULES.length - 1);
  });

  it("carries on with the other tables when one fails", async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error("lock timeout"))
      .mockResolvedValue(3);

    const deleted = await createService(execute).service.pruneAll(now);

    expect(deleted.auth_sessions).toBeUndefined();
    expect(Object.keys(deleted)).toHaveLength(RETENTION_RULES.length - 1);
  });

  it("never prunes a visitor session a lead still points at", () => {
    const rule = RETENTION_RULES.find((r) => r.table === "visitor_sessions");
    expect(rule?.where).toContain(`"leads"`);
  });

  it("applies admin-set windows after the fixed rules and records each run", async () => {
    const execute = jest.fn().mockResolvedValue(0);
    execute.mockImplementation(async (sql: string) => (sql.includes(`"chat_messages"`) ? 7 : 0));
    const { policies, service } = createService(execute, [
      { category: "CHAT_MESSAGES", rule: { ...RETENTION_CATEGORY_TARGETS.CHAT_MESSAGES, days: 30 } }
    ]);

    const deleted = await service.pruneAll(now);

    const chatCall = execute.mock.calls.find(([sql]) => String(sql).includes(`"chat_messages"`));
    expect(chatCall?.[1]).toBe("2026-09-03T12:00:00.000Z");
    expect(execute.mock.calls.at(-1)?.[0]).toContain(`"chat_messages"`);
    expect(deleted.chat_messages).toBe(7);
    expect(policies.recordSweep).toHaveBeenCalledWith("CHAT_MESSAGES", 7, now);
  });

  it("still runs the fixed rules when the policies can't be read", async () => {
    const execute = jest.fn().mockResolvedValue(0);
    const { policies, service } = createService(execute);
    policies.activeRules.mockRejectedValue(new Error("db down"));

    const deleted = await service.pruneAll(now);

    expect(Object.keys(deleted)).toHaveLength(RETENTION_RULES.length);
  });

  it("never deletes a queued message delivery", () => {
    expect(RETENTION_CATEGORY_TARGETS.MESSAGE_DELIVERIES.where).toContain(`'PENDING'`);
  });

  it("schedules the next sweep at 04:00 UTC", () => {
    expect(nextRetentionSweep(new Date("2026-10-03T03:59:00.000Z")).toISOString()).toBe("2026-10-03T04:00:00.000Z");
    expect(nextRetentionSweep(new Date("2026-10-03T04:00:00.000Z")).toISOString()).toBe("2026-10-04T04:00:00.000Z");
  });
});
