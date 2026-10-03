import { JOB_LOCKS, JobLockService } from "./job-lock.service";
import { PrismaService } from "./prisma.service";
import { resetDatabase } from "../test/integration/db";

describe("JobLockService (real Postgres)", () => {
  const prisma = new PrismaService();
  const locks = new JobLockService(prisma);
  const name = JOB_LOCKS.trashCleanup;

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it("lets exactly one of several concurrent runners in", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let ran = 0;
    const job = async () => {
      ran += 1;
      await gate;
    };

    const runs = Array.from({ length: 5 }, () => locks.runExclusive(name, job));
    // Give every acquire time to reach the database before the winner finishes.
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    const outcomes = await Promise.all(runs);

    expect(outcomes.filter((o) => o.acquired)).toHaveLength(1);
    expect(ran).toBe(1);
  });

  it("can be taken again once the holder releases it", async () => {
    await expect(locks.runExclusive(name, async () => "first")).resolves.toEqual({ acquired: true, result: "first" });
    await expect(locks.runExclusive(name, async () => "second")).resolves.toEqual({ acquired: true, result: "second" });
  });

  it("is taken over once a crashed holder's lease expires, whatever the session time zone", async () => {
    // A holder that died: lease ran out a second ago, in naive-UTC DB time.
    await prisma.$queryRaw`
      INSERT INTO "job_locks" ("name", "owner", "acquiredAt", "lockedUntil")
      VALUES (${name}, 'dead-process', now() AT TIME ZONE 'UTC', (now() AT TIME ZONE 'UTC') - interval '1 second')
    `;
    await expect(locks.runExclusive(name, async () => "rescued")).resolves.toEqual({ acquired: true, result: "rescued" });
  });

  it("is not taken over while a live lease is still running", async () => {
    await prisma.$queryRaw`
      INSERT INTO "job_locks" ("name", "owner", "acquiredAt", "lockedUntil")
      VALUES (${name}, 'other-instance', now() AT TIME ZONE 'UTC', (now() AT TIME ZONE 'UTC') + interval '1 minute')
    `;
    await expect(locks.runExclusive(name, async () => "nope")).resolves.toEqual({ acquired: false });
  });
});
