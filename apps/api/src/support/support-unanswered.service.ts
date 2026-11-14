import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  normalizeSupportText,
  supportUnansweredListQuerySchema,
  type SupportUnansweredQuestionItem,
  type SupportUnansweredQuestionListResponse
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";

/** The grouping key's length: two wordings that agree this far count as one question. */
const NORMALIZED_MAX = 200;
const TEXT_MAX = 500;

/**
 * Questions the WhatsApp bot couldn't answer (docs/WHATSAPP_SUPPORT.md §0), so
 * admins know which saved answers to write. Only the redacted text is kept,
 * never who asked; repeats of the same wording count on one row.
 */
@Injectable()
export class SupportUnansweredService {
  private readonly logger = new Logger(SupportUnansweredService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /** Counts each question once more (and shows a dismissed one again). Call inside the academy, after commit. Never throws. */
  async record(texts: string[], now: Date = new Date()): Promise<void> {
    for (const raw of texts) {
      const normalized = normalizeSupportText(raw).slice(0, NORMALIZED_MAX);
      if (!normalized) continue;
      const text = raw.trim().slice(0, TEXT_MAX);
      try {
        await this.upsert(normalized, text, now);
      } catch (error) {
        // Two parents asking the same new question at the same moment: the second insert loses, then counts.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          await this.upsert(normalized, text, now).catch((retry: Error) => this.logger.warn(`Unanswered question not recorded: ${retry.message}`));
        } else {
          this.logger.warn(`Unanswered question not recorded: ${(error as Error).message}`);
        }
      }
    }
  }

  /** Not dismissed, most asked first. */
  async list(accessToken: string | undefined, rawQuery: unknown): Promise<SupportUnansweredQuestionListResponse> {
    await this.getStaff(accessToken);
    const query = parseOrBadRequest(supportUnansweredListQuerySchema, rawQuery, "query");
    const { page, pageSize, search, skip, take } = resolvePagination(query);
    const where: Prisma.SupportUnansweredQuestionWhereInput = {
      dismissedAt: null,
      ...(search ? { text: { contains: search, mode: "insensitive" } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportUnansweredQuestion.findMany({
        orderBy: [{ timesAsked: "desc" }, { lastAskedAt: "desc" }, { id: "asc" }],
        skip,
        take,
        where
      }),
      this.prisma.supportUnansweredQuestion.count({ where })
    ]);
    return { items: rows.map(toItem), pagination: paginationMeta(total, page, pageSize) };
  }

  /** Hides it until a parent asks it again. */
  async dismiss(accessToken: string | undefined, id: string): Promise<{ id: string }> {
    const user = await this.getStaff(accessToken);
    const row = await this.prisma.supportUnansweredQuestion.findFirst({ select: { id: true }, where: { id } });
    if (!row) throw new NotFoundException("Question not found.");
    await this.prisma.supportUnansweredQuestion.updateMany({
      data: { dismissedAt: new Date(), dismissedById: user.id },
      where: { id }
    });
    return { id };
  }

  private upsert(normalized: string, text: string, now: Date) {
    return this.prisma.supportUnansweredQuestion.upsert({
      create: { firstAskedAt: now, lastAskedAt: now, normalized, text },
      update: { dismissedAt: null, dismissedById: null, lastAskedAt: now, text, timesAsked: { increment: 1 } },
      where: { tenantId_normalized: { normalized, tenantId: requireTenantId("unanswered support question") } }
    });
  }

  private async getStaff(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can see these questions.");
    }
    return user;
  }
}

function toItem(row: {
  firstAskedAt: Date;
  id: string;
  lastAskedAt: Date;
  text: string;
  timesAsked: number;
}): SupportUnansweredQuestionItem {
  return {
    firstAskedAt: row.firstAskedAt.toISOString(),
    id: row.id,
    lastAskedAt: row.lastAskedAt.toISOString(),
    text: row.text,
    timesAsked: row.timesAsked
  };
}
