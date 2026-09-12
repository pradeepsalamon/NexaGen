import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { Logger, Module, type DynamicModule } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { createDisabledQueue } from "./disabled-queue";
import {
  DEFAULT_JOB_OPTIONS,
  buildQueueConnection,
  isQueueEnabled
} from "./queue.config";

/**
 * BullMQ wiring. Redis is shared with LiveKit and egress, so every key is
 * namespaced with QUEUE_PREFIX.
 *
 * Queues are optional: with REDIS_URL unset the API boots with no workers and
 * producers resolve to {@link createDisabledQueue}, which keeps `npm run
 * dev:api` working without Docker.
 *
 * A feature module owns its queue name and registers it itself:
 *
 * ```ts
 * @Module({ imports: [QueueModule.registerQueue(WHATSAPP_QUEUE)], ... })
 * ```
 */
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static forRoot(): DynamicModule {
    const env = getApiEnv();

    if (!isQueueEnabled(env)) {
      const message =
        "REDIS_URL is unset — background queues are disabled. No worker runs and queued jobs are dropped.";
      if (env.NODE_ENV === "production") {
        QueueModule.logger.error(message);
      } else {
        QueueModule.logger.warn(message);
      }
      return { module: QueueModule };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({
          connection: buildQueueConnection(env),
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
          prefix: env.QUEUE_PREFIX
        })
      ],
      exports: [BullModule]
    };
  }

  /** Registers one queue, or its disabled stand-in. */
  static registerQueue(name: string): DynamicModule {
    if (!isQueueEnabled(getApiEnv())) {
      const token = getQueueToken(name);
      return {
        module: QueueModule,
        providers: [{ provide: token, useValue: createDisabledQueue(name) }],
        exports: [token]
      };
    }

    return {
      module: QueueModule,
      imports: [BullModule.registerQueue({ name })],
      exports: [BullModule]
    };
  }
}
