import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { RecordingStorageService } from "../live-class/recording-storage.service";
import type { JobLockService } from "../prisma/job-lock.service";
import type { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { AnalyticsScheduler } from "./analytics.scheduler";

function build() {
  const upsert = jest.fn().mockResolvedValue({});
  const aggregate = jest.fn().mockResolvedValue({ _sum: { recordingBytes: BigInt(1234) } });
  const prisma = {
    liveSession: { aggregate, count: jest.fn().mockResolvedValue(3) },
    storageSnapshot: { upsert }
  } as unknown as PrismaService;
  const storage = {
    getStorageUsage: jest.fn().mockResolvedValue({ limitBytes: 10_000_000, usagePercent: 50, usedBytes: 5_000_000 })
  } as unknown as RecordingStorageService;
  const scheduler = new AnalyticsScheduler({} as JobLockService, prisma, storage);
  return { aggregate, scheduler, upsert };
}

describe("AnalyticsScheduler.snapshot", () => {
  it("keeps the whole recordings folder for Nexa, which runs the server", async () => {
    const { aggregate, scheduler, upsert } = build();
    await runInTenant(DEFAULT_TENANT_ID, "spec", () => scheduler.snapshot(new Date("2026-11-15T06:00:00Z")));
    expect(aggregate).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0][0].create.recordingBytes).toBe(BigInt(5_000_000));
    expect(upsert.mock.calls[0][0].where.tenantId_capturedDate.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("gives another academy only its own recordings' bytes", async () => {
    const { aggregate, scheduler, upsert } = build();
    await runInTenant("tenant-b", "spec", () => scheduler.snapshot(new Date("2026-11-15T06:00:00Z")));
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.recordingBytes).toBe(BigInt(1234));
    expect(upsert.mock.calls[0][0].update.recordingBytes).toBe(BigInt(1234));
    expect(upsert.mock.calls[0][0].where.tenantId_capturedDate.tenantId).toBe("tenant-b");
  });
});
