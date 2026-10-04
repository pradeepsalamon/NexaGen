import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  HealthCheckResult,
  LivenessResponse,
  ReadinessResponse
} from "@nexa-chess/types";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildRequestPathConnection,
  isRedisConfigured
} from "../redis/redis.config";

const CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {}

  live(): LivenessResponse {
    return { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
  }

  async ready(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.check("database", () => this.prisma.$queryRaw`SELECT 1`),
      this.checkRedis()
    ]);

    const status =
      database.status !== "up"
        ? "unavailable"
        : redis.status === "down"
          ? "degraded"
          : "ok";

    return { status, checks: { database, redis } };
  }

  async onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }

  private checkRedis(): Promise<HealthCheckResult> {
    const env = getApiEnv();
    if (!isRedisConfigured(env)) {
      return Promise.resolve({ status: "disabled" });
    }

    this.redis ??= new Redis({
      ...buildRequestPathConnection(env, "health"),
      lazyConnect: true
    });
    const client = this.redis;

    return this.check("redis", async () => {
      if (client.status === "wait") await client.connect();
      await client.ping();
    });
  }

  private async check(
    name: string,
    probe: () => Promise<unknown>
  ): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        probe(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
            CHECK_TIMEOUT_MS
          );
        })
      ]);
      return { status: "up", latencyMs: Date.now() - startedAt };
    } catch (error) {
      // Logged, not returned: the endpoint is public.
      this.logger.warn(
        `Health check "${name}" failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: "down", latencyMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  }
}
