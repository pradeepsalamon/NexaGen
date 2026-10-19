import { Injectable, Logger } from "@nestjs/common";
import { DEFAULT_TIME_ZONE, zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import type { AnalyticsEventType } from "./analytics-events.constants";

/**
 * Records meaningful product actions to `analytics_events`. Every write is
 * fire-and-forget: a failure here must never break the request that triggered
 * it, so callers do not `await` a rejection and errors are only logged.
 */
@Injectable()
export class AnalyticsEventService {
  private readonly logger = new Logger(AnalyticsEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one event. Safe to call without `await`; the returned promise never
   * rejects.
   */
  async record(
    userId: string,
    type: AnalyticsEventType,
    entityId?: string | null,
    occurredAt: Date = new Date()
  ): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: { userId, type, entityId: entityId ?? null, occurredAt }
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record analytics event ${type} for user ${userId}: ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Records `RECORDING_WATCH` at most once per student/class/day so a student
   * scrubbing a recording does not flood the table.
   */
  async recordRecordingWatchOncePerDay(
    userId: string,
    classId: string
  ): Promise<void> {
    try {
      // The academy's day, not the container's local midnight.
      const since = zonedDayBounds(DEFAULT_TIME_ZONE).start;
      const existing = await this.prisma.analyticsEvent.findFirst({
        where: {
          userId,
          type: "RECORDING_WATCH",
          entityId: classId,
          occurredAt: { gte: since }
        },
        select: { id: true }
      });
      if (existing) return;
      await this.record(userId, "RECORDING_WATCH", classId);
    } catch (error) {
      this.logger.warn(
        `Failed to record recording-watch event for user ${userId}: ${
          (error as Error).message
        }`
      );
    }
  }
}
