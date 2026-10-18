import { getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as configModule from "@nexa-chess/config/api";
import type { ApiEnv } from "@nexa-chess/config/api";
import type { Queue } from "bullmq";
import { QueueModule } from "./queue.module";

const QUEUE = "test-queue";

const mockEnv = (redisUrl: string | undefined) => {
  jest.spyOn(configModule, "getApiEnv").mockReturnValue({
    NODE_ENV: "test",
    QUEUE_CONCURRENCY: 5,
    QUEUE_PREFIX: "nexa",
    REDIS_URL: redisUrl
  } as ApiEnv);
};

describe("QueueModule", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("without REDIS_URL", () => {
    beforeEach(() => {
      mockEnv(undefined);
    });

    it("boots with no Bull wiring", () => {
      expect(QueueModule.forRoot().imports).toBeUndefined();
    });

    it("still resolves an injected queue, so the API boots without Redis", async () => {
      @Module({ imports: [QueueModule.registerQueue(QUEUE)] })
      class HostModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [HostModule]
      }).compile();

      const queue = moduleRef.get<Queue>(getQueueToken(QUEUE));
      expect(queue.name).toBe(QUEUE);

      // Dropped, not thrown: a failed enqueue must never break the request.
      await expect(queue.add("send", { id: "1" })).resolves.toBeUndefined();
      await expect(queue.addBulk([{ name: "send", data: {} }])).resolves.toEqual(
        []
      );
    });
  });

  describe("with REDIS_URL", () => {
    beforeEach(() => {
      mockEnv("redis://127.0.0.1:6379");
    });

    it("registers the shared Bull configuration", () => {
      expect(QueueModule.forRoot().imports).toHaveLength(1);
    });

    it("registers a real queue rather than the stand-in", () => {
      const dynamicModule = QueueModule.registerQueue(QUEUE);

      expect(dynamicModule.imports).toHaveLength(1);
      expect(dynamicModule.providers).toBeUndefined();
    });
  });
});
