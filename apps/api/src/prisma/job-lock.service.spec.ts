import { JOB_LOCKS, JobLockService } from "./job-lock.service";
import type { PrismaService } from "./prisma.service";

describe("JobLockService", () => {
  let prisma: { $queryRaw: jest.Mock; $executeRaw: jest.Mock };
  let service: JobLockService;

  // The acquire query echoes back the owner only when this run won the lease.
  const grantLease = () =>
    prisma.$queryRaw.mockImplementation(async (_sql: unknown, ...values: unknown[]) => [
      { owner: values[1] }
    ]);

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1)
    };
    service = new JobLockService(prisma as unknown as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it("runs the job and releases the lease when it wins", async () => {
    grantLease();
    const run = jest.fn().mockResolvedValue(7);

    const outcome = await service.runExclusive(JOB_LOCKS.trashCleanup, run);

    expect(outcome).toEqual({ acquired: true, result: 7 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("skips the job while another runner holds the lease", async () => {
    const run = jest.fn();

    const outcome = await service.runExclusive(JOB_LOCKS.trashCleanup, run);

    expect(outcome).toEqual({ acquired: false });
    expect(run).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("releases the lease even when the job throws", async () => {
    grantLease();

    await expect(
      service.runExclusive(JOB_LOCKS.trashCleanup, () => Promise.reject(new Error("boom")))
    ).rejects.toThrow("boom");

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does not turn a failed release into a failed job", async () => {
    grantLease();
    prisma.$executeRaw.mockRejectedValue(new Error("db down"));

    await expect(
      service.runExclusive(JOB_LOCKS.trashCleanup, async () => "done")
    ).resolves.toEqual({ acquired: true, result: "done" });
  });

  it("renews the lease while a long job is still running", async () => {
    jest.useFakeTimers();
    grantLease();
    let finish!: () => void;
    const running = service.runExclusive(
      JOB_LOCKS.trashCleanup,
      () => new Promise<void>((resolve) => (finish = resolve)),
      { ttlMs: 30_000 }
    );
    await Promise.resolve();
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(25_000);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);

    finish();
    await running;
    // Two renewals plus the release, and no renewal after the job ended.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("gives every job its own lock name", () => {
    const names = Object.values(JOB_LOCKS);
    expect(new Set(names).size).toBe(names.length);
  });
});
