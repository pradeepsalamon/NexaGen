import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationListResponse,
  NotificationType
} from "@nexa-chess/types";
import { Prisma, UserStatus } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";

type NotificationRow = Prisma.NotificationGetPayload<Record<string, never>>;

const LIST_LIMIT = 50;

/** One notification to create — see {@link NotificationService.notify}. */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string | null;
  /** idempotency key; a repeat insert with the same (userId, dedupeKey) is a no-op. */
  dedupeKey?: string | null;
}

@Injectable()
export class NotificationService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── read side (student/coach/admin — anyone authenticated) ──

  async list(accessToken: string | undefined): Promise<NotificationListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } })
    ]);
    return { notifications: rows.map((r) => this.toItem(r)), unreadCount };
  }

  async markRead(
    accessToken: string | undefined,
    dto: MarkNotificationsReadRequest
  ): Promise<MarkNotificationsReadResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.prisma.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(dto.ids && dto.ids.length > 0 ? { id: { in: dto.ids } } : {})
      },
      data: { readAt: new Date() }
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null }
    });
    return { unreadCount };
  }

  // ── write side (called by other services / schedulers) ──

  /** Create one notification. Silently skips a duplicate `dedupeKey`. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          linkPath: input.linkPath ?? null,
          dedupeKey: input.dedupeKey ?? null
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return; // already sent (same userId + dedupeKey)
      }
      this.logger.warn(`Failed to create notification: ${(error as Error).message}`);
    }
  }

  /** Create many notifications, de-duplicating on `dedupeKey`. Returns the count inserted. */
  async notifyMany(inputs: NotifyInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const { count } = await this.prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body,
        linkPath: i.linkPath ?? null,
        dedupeKey: i.dedupeKey ?? null
      })),
      skipDuplicates: true
    });
    return count;
  }

  // ── internals ──

  private toItem(row: NotificationRow): NotificationItem {
    return {
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      linkPath: row.linkPath,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    };
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) throw new UnauthorizedException("Access token is missing.");

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: this.env.JWT_ACCESS_SECRET
    });
    if (payload.type !== "access") throw new UnauthorizedException("Invalid token type.");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }
    return user;
  }
}
