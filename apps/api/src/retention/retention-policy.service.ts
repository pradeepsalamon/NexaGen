import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  retentionCategorySchema,
  retentionDaysError,
  type RetentionCategory,
  type RetentionPolicyItem,
  type RetentionPolicyListResponse,
  type RetentionPreviewQuery,
  type RetentionPreviewResponse,
  type UpdateRetentionPolicyRequest
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import {
  RETENTION_CATEGORY_TARGETS,
  RETENTION_RULES,
  countEligibleSql,
  nextRetentionSweep,
  oldestRecordSql,
  retentionCutoff,
  type RetentionRule
} from "./retention.rules";

const CATEGORIES = retentionCategorySchema.options;

type PolicyRow = {
  category: RetentionCategory;
  changedAt: Date | null;
  days: number | null;
  lastDeletedCount: number | null;
  lastSweptAt: Date | null;
  updatedBy: { firstName: string; lastName: string | null } | null;
};

/**
 * Admin-set retention windows (super admin only: a window deletes data for
 * good). Every category is listed, with or without a row; a missing row means
 * kept forever, the default.
 */
@Injectable()
export class RetentionPolicyService {
  private readonly logger = new Logger(RetentionPolicyService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async list(accessToken: string | undefined, now: Date = new Date()): Promise<RetentionPolicyListResponse> {
    await this.assertSuperAdmin(accessToken);
    const rows = await this.rows();
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    const policies = await Promise.all(
      CATEGORIES.map((category) => this.toItem(category, byCategory.get(category) ?? null, now))
    );
    return {
      fixedRules: RETENTION_RULES.map((r) => ({ days: r.days, label: r.label })),
      nextSweepAt: nextRetentionSweep(now).toISOString(),
      policies
    };
  }

  async update(
    accessToken: string | undefined,
    category: RetentionCategory,
    dto: UpdateRetentionPolicyRequest,
    now: Date = new Date()
  ): Promise<RetentionPolicyItem> {
    const user = await this.assertSuperAdmin(accessToken);
    const error = retentionDaysError(category, dto.days);
    if (error) throw new BadRequestException(error);

    const row = await this.prisma.retentionPolicy.upsert({
      create: { category, changedAt: now, days: dto.days, updatedById: user.id },
      select: this.select,
      update: { changedAt: now, days: dto.days, updatedById: user.id },
      where: { category }
    });
    this.logger.log(
      `Retention for ${category} set to ${dto.days === null ? "keep forever" : `${dto.days} days`} by user ${user.id}`
    );
    return this.toItem(category, row, now);
  }

  async preview(
    accessToken: string | undefined,
    category: RetentionCategory,
    query: RetentionPreviewQuery,
    now: Date = new Date()
  ): Promise<RetentionPreviewResponse> {
    await this.assertSuperAdmin(accessToken);
    const error = retentionDaysError(category, query.days);
    if (error) throw new BadRequestException(error);
    const cutoff = retentionCutoff(query.days, now);
    return {
      category,
      cutoff,
      days: query.days,
      eligibleCount: await this.countEligible(category, cutoff)
    };
  }

  /** The windows the sweep applies tonight. */
  async activeRules(): Promise<{ category: RetentionCategory; rule: RetentionRule }[]> {
    const rows = await this.prisma.retentionPolicy.findMany({
      select: { category: true, days: true },
      where: { days: { not: null } }
    });
    return rows
      // A row edited by hand below the minimum is skipped, never applied.
      .filter((r): r is { category: RetentionCategory; days: number } => r.days !== null && !retentionDaysError(r.category, r.days))
      .map((r) => ({ category: r.category, rule: { ...RETENTION_CATEGORY_TARGETS[r.category], days: r.days } }));
  }

  async recordSweep(category: RetentionCategory, deleted: number, at: Date): Promise<void> {
    await this.prisma.retentionPolicy.update({
      data: { lastDeletedCount: deleted, lastSweptAt: at },
      where: { category }
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private readonly select = {
    category: true,
    changedAt: true,
    days: true,
    lastDeletedCount: true,
    lastSweptAt: true,
    updatedBy: { select: { firstName: true, lastName: true } }
  } as const;

  private rows(): Promise<PolicyRow[]> {
    return this.prisma.retentionPolicy.findMany({ select: this.select });
  }

  private async toItem(category: RetentionCategory, row: PolicyRow | null, now: Date): Promise<RetentionPolicyItem> {
    const days = row?.days ?? null;
    const [oldestRecordAt, eligibleCount] = await Promise.all([
      this.oldestRecord(category),
      days === null || retentionDaysError(category, days)
        ? Promise.resolve(null)
        : this.countEligible(category, retentionCutoff(days, now))
    ]);
    return {
      category,
      days,
      eligibleCount,
      lastDeletedCount: row?.lastDeletedCount ?? null,
      lastSweptAt: row?.lastSweptAt?.toISOString() ?? null,
      oldestRecordAt,
      updatedAt: row?.changedAt?.toISOString() ?? null,
      updatedByName: row?.updatedBy
        ? [row.updatedBy.firstName, row.updatedBy.lastName].filter(Boolean).join(" ")
        : null
    };
  }

  private async countEligible(category: RetentionCategory, cutoff: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      countEligibleSql(RETENTION_CATEGORY_TARGETS[category]),
      cutoff
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async oldestRecord(category: RetentionCategory): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ oldest: Date | null }[]>(
      oldestRecordSql(RETENTION_CATEGORY_TARGETS[category])
    );
    return rows[0]?.oldest?.toISOString() ?? null;
  }

  private async assertSuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only super admins can manage data retention.");
    }
    return user;
  }
}
