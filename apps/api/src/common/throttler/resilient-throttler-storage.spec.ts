import type { ThrottlerStorage } from "@nestjs/throttler";
import { ResilientThrottlerStorage } from "./resilient-throttler-storage";

type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

const record: ThrottlerRecord = {
  totalHits: 1,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0
};

const hit = (storage: ResilientThrottlerStorage) =>
  storage.increment("1.2.3.4", 60000, 100, 0, "default");

describe("ResilientThrottlerStorage", () => {
  let primary: { increment: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    primary = { increment: jest.fn().mockResolvedValue(record) };
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("uses Redis while it is healthy", async () => {
    const storage = new ResilientThrottlerStorage(primary);

    await expect(hit(storage)).resolves.toEqual(record);
    expect(primary.increment).toHaveBeenCalledTimes(1);
  });

  it("counts in-process instead of throwing when Redis fails", async () => {
    primary.increment.mockRejectedValue(new Error("ECONNREFUSED"));
    const storage = new ResilientThrottlerStorage(primary);

    const result = await hit(storage);

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });

  it("still enforces the limit while degraded", async () => {
    primary.increment.mockRejectedValue(new Error("ECONNREFUSED"));
    const storage = new ResilientThrottlerStorage(primary);

    let last = await storage.increment("1.2.3.4", 60000, 2, 60000, "default");
    for (let i = 0; i < 2; i += 1) {
      last = await storage.increment("1.2.3.4", 60000, 2, 60000, "default");
    }

    expect(last.isBlocked).toBe(true);
  });

  it("stops calling Redis for a cooldown after a failure", async () => {
    primary.increment.mockRejectedValue(new Error("ECONNREFUSED"));
    const storage = new ResilientThrottlerStorage(primary);

    await hit(storage);
    await hit(storage);
    await hit(storage);

    expect(primary.increment).toHaveBeenCalledTimes(1);
  });

  it("retries Redis once the cooldown elapses", async () => {
    primary.increment.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const storage = new ResilientThrottlerStorage(primary);

    await hit(storage);
    jest.setSystemTime(Date.now() + 11_000);
    await expect(hit(storage)).resolves.toEqual(record);

    expect(primary.increment).toHaveBeenCalledTimes(2);
  });

  it("tears the wrapped client down with the module", () => {
    const destroyable = { increment: jest.fn(), onModuleDestroy: jest.fn() };
    new ResilientThrottlerStorage(destroyable).onModuleDestroy();

    expect(destroyable.onModuleDestroy).toHaveBeenCalledTimes(1);
  });
});
