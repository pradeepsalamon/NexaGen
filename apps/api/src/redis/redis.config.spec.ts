import {
  buildRequestPathConnection,
  isRedisConfigured,
  parseRedisUrl,
  type RedisEnv
} from "./redis.config";

const baseEnv: RedisEnv = {
  QUEUE_PREFIX: "nexa",
  REDIS_URL: "redis://127.0.0.1:6379"
};

describe("redis.config", () => {
  it("reports whether Redis is configured", () => {
    expect(isRedisConfigured(baseEnv)).toBe(true);
    expect(isRedisConfigured({ ...baseEnv, REDIS_URL: undefined })).toBe(false);
  });

  describe("parseRedisUrl", () => {
    it("carries no retry policy of its own", () => {
      const options = parseRedisUrl(baseEnv);

      expect(options).not.toHaveProperty("maxRetriesPerRequest");
      expect(options).not.toHaveProperty("enableOfflineQueue");
    });

    it("throws without REDIS_URL", () => {
      expect(() => parseRedisUrl({ ...baseEnv, REDIS_URL: undefined })).toThrow(
        /REDIS_URL/
      );
    });
  });

  describe("buildRequestPathConnection", () => {
    it("namespaces keys under the queue prefix", () => {
      expect(buildRequestPathConnection(baseEnv, "throttle")).toMatchObject({
        keyPrefix: "nexa:throttle:"
      });
    });

    it("fails fast instead of queueing while Redis is unreachable", () => {
      expect(buildRequestPathConnection(baseEnv, "throttle")).toMatchObject({
        commandTimeout: 1000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1
      });
    });
  });
});
