import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationListResponse,
  NotificationType
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { authenticateUser } from "../auth/authenticate";

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

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
