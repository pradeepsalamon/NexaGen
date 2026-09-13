import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AnnouncementItem,
  AnnouncementListResponse,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse
} from "@nexa-chess/types";
import type { Announcement, Batch } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import { PrismaService } from "../prisma/prisma.service";

type AnnouncementRow = Announcement & {
  batch?: Pick<Batch, "name"> | null;
  createdBy?: { firstName: string; lastName: string | null } | null;
};

/**
 * Admin-published announcements. Creating one writes the dashboard feed row and
 * then fires the ANNOUNCEMENT messaging rule, so the same copy reaches WhatsApp
 * and the in-app bell without the admin sending anything twice.
 */
@Injectable()
export class AnnouncementService {
  constructor(
    private readonly dispatch: MessagingDispatchService,
    private readonly messagingRules: MessagingRuleService,
    private readonly prisma: PrismaService
  ) {}

  async list(accessToken: string | undefined): Promise<AnnouncementListResponse> {
    await this.messagingRules.assertAdmin(accessToken);

    const rows = await this.prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        batch: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      }
    });

    return { announcements: rows.map((row) => this.toItem(row)) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreateAnnouncementRequest
  ): Promise<CreateAnnouncementResponse> {
    const admin = await this.messagingRules.assertAdmin(accessToken);

    if (dto.audience === "BATCH") {
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
        select: { id: true }
      });
      if (!batch) {
        throw new BadRequestException("That batch no longer exists.");
      }
    }

    const row = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        description: dto.body,
        // Legacy label the student dashboard feed still renders.
        type: dto.audience === "BATCH" ? "BATCH" : "PLATFORM",
        audience: dto.audience,
        batchId: dto.audience === "BATCH" ? dto.batchId : null,
        createdById: admin.id
      },
      include: {
        batch: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      }
    });

    // Publishing must not fail because a message did — the announcement is
    // already on the dashboard either way.
    const dispatch = dto.sendMessages
      ? await this.dispatch
          .dispatch({ event: "ANNOUNCEMENT", announcementId: row.id })
          .catch(() => null)
      : null;

    return {
      announcement: this.toItem(row),
      dispatch: dispatch ?? {
        ruleEnabled: false,
        recipients: 0,
        queuedWhatsApp: 0,
        queuedInApp: 0,
        missingPhone: 0,
        scheduledFor: null
      }
    };
  }

  /** Removes it from the dashboard feed. Messages already sent are not recalled. */
  async delete(accessToken: string | undefined, id: string): Promise<void> {
    await this.messagingRules.assertAdmin(accessToken);

    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Announcement not found.");
    }

    await this.prisma.announcement.delete({ where: { id } });
  }

  private toItem(row: AnnouncementRow): AnnouncementItem {
    return {
      id: row.id,
      title: row.title,
      body: row.description,
      audience: row.audience,
      batchId: row.batchId,
      batchName: row.batch?.name ?? null,
      createdByName: row.createdBy
        ? `${row.createdBy.firstName} ${row.createdBy.lastName ?? ""}`.trim()
        : null,
      createdAt: row.createdAt.toISOString()
    };
  }
}
