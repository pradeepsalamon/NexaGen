import type { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import type { PrismaService } from "../prisma/prisma.service";
import { RETENTION_BATCH_SIZE, RETENTION_RULES } from "./retention.rules";
import { RetentionService } from "./retention.service";

function createService(executeRawUnsafe: jest.Mock) {
  const prisma = { $executeRawUnsafe: executeRawUnsafe } as unknown as PrismaService;
  return new RetentionService(prisma, createJobLockStub() as unknown as JobLockService);
}

describe("RetentionService", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("binds the cutoff as naive-UTC ISO text, never a Date", async () => {
    const execute = jest.fn().mockResolvedValue(0);
    await createService(execute).pruneAll(now);

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

    const deleted = await createService(execute).pruneAll(now);

    expect(deleted.auth_sessions).toBe(RETENTION_BATCH_SIZE * 2 + 12);
    expect(execute).toHaveBeenCalledTimes(3 + RETENTION_RULES.length - 1);
  });

  it("carries on with the other tables when one fails", async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error("lock timeout"))
      .mockResolvedValue(3);

    const deleted = await createService(execute).pruneAll(now);

    expect(deleted.auth_sessions).toBeUndefined();
    expect(Object.keys(deleted)).toHaveLength(RETENTION_RULES.length - 1);
  });

  it("never prunes a visitor session a lead still points at", () => {
    const rule = RETENTION_RULES.find((r) => r.table === "visitor_sessions");
    expect(rule?.where).toContain(`"leads"`);
  });
});
