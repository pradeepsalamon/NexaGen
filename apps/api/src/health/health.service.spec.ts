import { getApiEnv } from "@nexa-chess/config/api";
import Redis from "ioredis";
import type { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";

jest.mock("@nexa-chess/config/api", () => ({ getApiEnv: jest.fn() }));
jest.mock("ioredis");

const mockedGetApiEnv = getApiEnv as jest.Mock;
const MockedRedis = Redis as unknown as jest.Mock;

function createService(queryRaw: jest.Mock = jest.fn().mockResolvedValue([{ "?column?": 1 }])) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return { queryRaw, service: new HealthService(prisma) };
}

function mockRedisClient(ping: jest.Mock) {
  MockedRedis.mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ping,
    status: "wait"
  }));
}

describe("HealthService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetApiEnv.mockReturnValue({ QUEUE_PREFIX: "nexa", REDIS_URL: undefined });
  });

  it("reports liveness without touching any dependency", () => {
    const { queryRaw, service } = createService();

    expect(service.live()).toMatchObject({ status: "ok" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("is ready with Redis disabled when REDIS_URL is unset", async () => {
    const { service } = createService();

    const result = await service.ready();

    expect(result.status).toBe("ok");
    expect(result.checks.database.status).toBe("up");
    expect(result.checks.redis).toEqual({ status: "disabled" });
    expect(MockedRedis).not.toHaveBeenCalled();
  });

  it("is unavailable when the database query fails", async () => {
    const { service } = createService(jest.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await service.ready();

    expect(result.status).toBe("unavailable");
    expect(result.checks.database.status).toBe("down");
  });

  it("is degraded, not unavailable, when only Redis is down", async () => {
    mockedGetApiEnv.mockReturnValue({ QUEUE_PREFIX: "nexa", REDIS_URL: "redis://localhost:6379" });
    mockRedisClient(jest.fn().mockRejectedValue(new Error("Connection is closed")));
    const { service } = createService();

    const result = await service.ready();

    expect(result.status).toBe("degraded");
    expect(result.checks.redis.status).toBe("down");
  });

  it("reuses one Redis client across checks", async () => {
    mockedGetApiEnv.mockReturnValue({ QUEUE_PREFIX: "nexa", REDIS_URL: "redis://localhost:6379" });
    const ping = jest.fn().mockResolvedValue("PONG");
    mockRedisClient(ping);
    const { service } = createService();

    await service.ready();
    const result = await service.ready();

    expect(result.status).toBe("ok");
    expect(MockedRedis).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("marks a hung database as down after the timeout", async () => {
    jest.useFakeTimers();
    try {
      const { service } = createService(jest.fn(() => new Promise(() => undefined)));

      const pending = service.ready();
      await jest.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(result.status).toBe("unavailable");
      expect(result.checks.database.status).toBe("down");
    } finally {
      jest.useRealTimers();
    }
  });
});
