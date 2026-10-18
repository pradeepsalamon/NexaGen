import {
  buildQueueConnection,
  buildWorkerOptions,
  isQueueEnabled,
  type QueueEnv
} from "./queue.config";

const baseEnv: QueueEnv = {
  QUEUE_CONCURRENCY: 5,
  QUEUE_PREFIX: "nexa",
  REDIS_URL: "redis://127.0.0.1:6379"
};

describe("queue.config", () => {
  describe("isQueueEnabled", () => {
    it("is enabled when REDIS_URL is set", () => {
      expect(isQueueEnabled(baseEnv)).toBe(true);
    });

    it("is disabled when REDIS_URL is absent", () => {
      expect(isQueueEnabled({ ...baseEnv, REDIS_URL: undefined })).toBe(false);
    });
  });

  describe("buildQueueConnection", () => {
    it("parses host, port and database", () => {
      const connection = buildQueueConnection({
        ...baseEnv,
        REDIS_URL: "redis://redis:6380/3"
      });

      expect(connection).toMatchObject({ host: "redis", port: 6380, db: 3 });
    });

    it("defaults the port and database", () => {
      expect(buildQueueConnection(baseEnv)).toMatchObject({ port: 6379, db: 0 });
    });

    it("decodes credentials", () => {
      const connection = buildQueueConnection({
        ...baseEnv,
        REDIS_URL: "redis://user:p%40ss@redis:6379"
      });

      expect(connection).toMatchObject({ username: "user", password: "p@ss" });
    });

    it("enables tls for rediss://", () => {
      expect(
        buildQueueConnection({ ...baseEnv, REDIS_URL: "rediss://redis:6379" })
      ).toMatchObject({ tls: {} });
    });

    it("never caps retries per request — BullMQ workers block on commands", () => {
      expect(buildQueueConnection(baseEnv)).toMatchObject({
        maxRetriesPerRequest: null
      });
    });

    it("throws when REDIS_URL is absent", () => {
      expect(() =>
        buildQueueConnection({ ...baseEnv, REDIS_URL: undefined })
      ).toThrow(/REDIS_URL/);
    });
  });

  it("takes worker concurrency from the environment", () => {
    expect(buildWorkerOptions({ ...baseEnv, QUEUE_CONCURRENCY: 12 })).toEqual({
      concurrency: 12
    });
  });
});
