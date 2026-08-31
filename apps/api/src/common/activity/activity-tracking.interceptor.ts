import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type { Request } from "express";
import { Observable } from "rxjs";
import { AUTH_COOKIE_NAMES } from "../../auth/types";
import type { AccessTokenPayload } from "../../auth/types/jwt-payload.types";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACTIVITY_WRITE_WINDOW_MS,
  isNonActivityPath,
  shouldWriteLastActive
} from "./activity-throttle";

/**
 * Updates `User.lastActiveAt` as a coarse recency signal for engagement
 * analytics. Runs on every request but writes at most once per
 * `ACTIVITY_WRITE_WINDOW_MS` per user (tracked in-process — a small amount of
 * cross-instance drift is fine for a "last seen" timestamp, and the stack has
 * no shared cache). Anonymous requests, health checks, the engine proxy and
 * webhooks are ignored. The write is fire-and-forget and never blocks or fails
 * the response.
 */
@Injectable()
export class ActivityTrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityTrackingInterceptor.name);
  private readonly env = getApiEnv();
  private readonly lastWriteByUser = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === "http") {
      void this.touch(context.switchToHttp().getRequest<Request>());
    }
    return next.handle();
  }

  private async touch(request: Request): Promise<void> {
    try {
      if (isNonActivityPath(request.path)) return;

      const token = request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
      if (!token) return;

      let userId: string;
      try {
        const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
          token,
          { secret: this.env.JWT_ACCESS_SECRET }
        );
        if (payload.type !== "access") return;
        userId = payload.sub;
      } catch {
        return; // expired / invalid — not our concern here
      }

      const now = Date.now();
      if (
        !shouldWriteLastActive(
          this.lastWriteByUser.get(userId),
          now,
          ACTIVITY_WRITE_WINDOW_MS
        )
      ) {
        return;
      }
      this.lastWriteByUser.set(userId, now);
      this.pruneCache(now);

      await this.prisma.user.updateMany({
        data: { lastActiveAt: new Date(now) },
        where: { id: userId }
      });
    } catch (error) {
      this.logger.warn(
        `lastActiveAt update skipped: ${(error as Error).message}`
      );
    }
  }

  /** Keeps the in-process map from growing unbounded on a long-lived process. */
  private pruneCache(now: number): void {
    if (this.lastWriteByUser.size < 5000) return;
    for (const [id, at] of this.lastWriteByUser) {
      if (now - at >= ACTIVITY_WRITE_WINDOW_MS) this.lastWriteByUser.delete(id);
    }
  }
}
