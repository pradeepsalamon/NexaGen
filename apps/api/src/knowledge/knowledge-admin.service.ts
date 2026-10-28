import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  KNOWLEDGE_TREND_DAYS,
  detectKnowledgeWarnings,
  diffKnowledgeLines,
  isKnowledgeArticleLive,
  knowledgeVersionText,
  normalizeKnowledgeQuery,
  slugifyKnowledgeTitle,
  type KnowledgeAdminArticleDetail,
  type KnowledgeAdminArticleSummary,
  type KnowledgeAdminListQuery,
  type KnowledgeAdminListResponse,
  type KnowledgeAudience,
  type KnowledgeCategoryDto,
  type KnowledgeCategoryRequest,
  type KnowledgeContentInput,
  type KnowledgeEventDto,
  type KnowledgeExportFile,
  type KnowledgeImportRequest,
  type KnowledgeImportResponse,
  type KnowledgeInsightsResponse,
  type KnowledgeQueryInsight,
  type KnowledgeSettingsInput,
  type KnowledgeSubmissionsResponse,
  type KnowledgeVersionDiffResponse,
  type PublishKnowledgeRequest,
  type RejectKnowledgeRequest,
  type ResolveKnowledgeQueryRequest,
  type RollbackKnowledgeRequest,
  type UpdateKnowledgeCategoryRequest,
  knowledgeImportSchema,
  knowledgeSettingsSchema,
  knowledgeContentSchema,
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { uniqueKnowledgeSlug } from "./knowledge.service";
import {
  personName,
  toVersionDto,
  toVersionSummary,
  versionInclude,
  type KnowledgeActor,
} from "./knowledge.shared";

const DAY_MS = 24 * 60 * 60 * 1000;

const listInclude = {
  _count: { select: { versions: { where: { status: "SUBMITTED" } } } },
  category: { select: { name: true } },
  publishedVersion: { select: { number: true, title: true, warnings: true } },
  versions: {
    orderBy: { number: "desc" },
    select: { status: true, title: true, warnings: true },
    take: 1,
    where: { status: "DRAFT" },
  },
} satisfies Prisma.KnowledgeArticleInclude;

type ListRow = Prisma.KnowledgeArticleGetPayload<{ include: typeof listInclude }>;

type Tx = PrismaTransactionClient;

/** Settings compared for the change log, in a stable JSON form. */
type SettingsSnapshot = {
  audience: KnowledgeAudience[];
  batchIds: string[];
  categoryId: string | null;
  expiresAt: string | null;
  kind: string;
  language: string;
  publishAt: string | null;
  reviewBy: string | null;
  routeTags: string[];
  sourceNote: string | null;
  sourceType: string;
  translationGroupId: string | null;
};

/**
 * Admin / super-admin authoring for the knowledge base. Every write is logged
 * as a `KnowledgeArticleEvent`; content changes are versions (a published
 * version is never edited — the next edit is a new DRAFT), and settings
 * changes record what changed. Permanent delete is super-admin only.
 */
@Injectable()
export class KnowledgeAdminService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Articles ──────────────────────────────────────────────────────────────

  async list(accessToken: string | undefined, query: KnowledgeAdminListQuery): Promise<KnowledgeAdminListResponse> {
    await this.getStaff(accessToken);
    const now = new Date();
    const and: Prisma.KnowledgeArticleWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.audience) and.push({ audience: { has: query.audience } });
    if (query.q) {
      and.push({
        OR: [
          { slug: { contains: query.q, mode: "insensitive" } },
          { versions: { some: { title: { contains: query.q, mode: "insensitive" } } } },
        ],
      });
    }
    if (query.filter === "needsReview") and.push({ reviewBy: { lte: now }, status: { not: "ARCHIVED" } });
    if (query.filter === "scheduled") and.push({ publishAt: { gt: now }, status: "PUBLISHED" });
    if (query.filter === "expired") and.push({ expiresAt: { lte: now }, status: "PUBLISHED" });
    if (query.filter === "flagged") {
      and.push({ versions: { some: { status: { in: ["DRAFT", "SUBMITTED", "PUBLISHED"] }, warnings: { isEmpty: false } } } });
    }
    const [rows, needsReview, submissions, flagged] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        include: listInclude,
        orderBy: { updatedAt: "desc" },
        take: 500,
        where: { AND: and },
      }),
      this.prisma.knowledgeArticle.count({ where: { reviewBy: { lte: now }, status: { not: "ARCHIVED" } } }),
      this.prisma.knowledgeArticleVersion.count({ where: { status: "SUBMITTED" } }),
      this.prisma.knowledgeArticle.count({
        where: { versions: { some: { status: { in: ["DRAFT", "SUBMITTED", "PUBLISHED"] }, warnings: { isEmpty: false } } } },
      }),
    ]);
    const votes = await this.voteCounts(rows.map((r) => r.id));
    return {
      articles: rows.map((r) => this.toSummary(r, votes.get(r.id), now)),
      counts: { flagged, needsReview, submissions },
    };
  }

  async detail(accessToken: string | undefined, id: string): Promise<KnowledgeAdminArticleDetail> {
    await this.getStaff(accessToken);
    return this.loadDetail(id);
  }

  async create(
    accessToken: string | undefined,
    content: KnowledgeContentInput,
    settings: KnowledgeSettingsInput,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.assertSettingsRefs(settings);
    const slug = await uniqueKnowledgeSlug(this.prisma, slugifyKnowledgeTitle(content.title));
    const article = await this.prisma.$transaction(async (tx) => {
      const translationGroupId = await this.translationGroupFor(tx, settings.translationOfId);
      const created = await tx.knowledgeArticle.create({
        data: {
          ...this.settingsData(settings),
          batches: { create: settings.batchIds.map((batchId) => ({ batchId })) },
          createdById: user.id,
          latestVersionNumber: 1,
          slug,
          translationGroupId,
        },
      });
      const version = await tx.knowledgeArticleVersion.create({
        data: { ...this.contentData(content, settings), articleId: created.id, authorId: user.id, number: 1 },
      });
      await tx.knowledgeArticleEvent.create({
        data: { actorId: user.id, articleId: created.id, type: "CREATED", versionId: version.id },
      });
      return created;
    });
    return this.loadDetail(article.id);
  }

  /** Writes the open draft, starting one (the next version number) if there is none. */
  async saveDraft(
    accessToken: string | undefined,
    id: string,
    content: KnowledgeContentInput,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const article = await this.findArticle(tx, id);
      const data = this.contentData(content, article);
      const draft = await tx.knowledgeArticleVersion.findFirst({
        select: { id: true },
        orderBy: { number: "desc" },
        where: { articleId: id, status: "DRAFT" },
      });
      let versionId: string;
      if (draft) {
        await tx.knowledgeArticleVersion.update({ data: { ...data, authorId: user.id }, where: { id: draft.id } });
        versionId = draft.id;
      } else {
        const bumped = await tx.knowledgeArticle.update({
          data: { latestVersionNumber: { increment: 1 } },
          where: { id },
        });
        versionId = (
          await tx.knowledgeArticleVersion.create({
            data: { ...data, articleId: id, authorId: user.id, number: bumped.latestVersionNumber },
          })
        ).id;
      }
      await tx.knowledgeArticle.update({ data: { updatedAt: new Date() }, where: { id } });
      await tx.knowledgeArticleEvent.create({
        data: { actorId: user.id, articleId: id, type: "DRAFT_SAVED", versionId },
      });
    });
    return this.loadDetail(id);
  }

  async discardDraft(accessToken: string | undefined, id: string): Promise<KnowledgeAdminArticleDetail> {
    await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const draft = await tx.knowledgeArticleVersion.findFirst({ where: { articleId: id, status: "DRAFT" } });
      if (!draft) throw new NotFoundException("There is no draft to discard.");
      const others = await tx.knowledgeArticleVersion.count({ where: { articleId: id, id: { not: draft.id } } });
      if (others === 0) {
        throw new ConflictException("This is the article's only version. Archive or delete the article instead.");
      }
      await tx.knowledgeArticleVersion.delete({ where: { id: draft.id } });
    });
    return this.loadDetail(id);
  }

  async updateSettings(
    accessToken: string | undefined,
    id: string,
    settings: KnowledgeSettingsInput,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.assertSettingsRefs(settings, id);
    await this.prisma.$transaction(async (tx) => {
      const article = await this.findArticle(tx, id);
      const before = snapshot(article, article.batches.map((b) => b.batchId));
      const translationGroupId = await this.translationGroupFor(tx, settings.translationOfId);
      const after = snapshot({ ...this.settingsData(settings), translationGroupId }, settings.batchIds);
      const changed = (Object.keys(after) as (keyof SettingsSnapshot)[]).filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      );
      if (!changed.length) return;
      await tx.knowledgeArticle.update({
        data: {
          ...this.settingsData(settings),
          batches: { create: settings.batchIds.map((batchId) => ({ batchId })), deleteMany: {} },
          translationGroupId,
        },
        where: { id },
      });
      // A credit-note change can clear (or raise) "missing-credit" on the open versions.
      const open = await tx.knowledgeArticleVersion.findMany({
        where: { articleId: id, status: { in: ["DRAFT", "SUBMITTED", "PUBLISHED"] } },
      });
      for (const v of open) {
        const warnings = detectKnowledgeWarnings({ ...v, sourceNote: settings.sourceNote, sourceType: settings.sourceType });
        if (JSON.stringify(warnings) !== JSON.stringify(v.warnings)) {
          await tx.knowledgeArticleVersion.update({ data: { warnings }, where: { id: v.id } });
        }
      }
      await tx.knowledgeArticleEvent.create({
        data: {
          actorId: user.id,
          articleId: id,
          detail: {
            after: Object.fromEntries(changed.map((k) => [k, after[k]])),
            before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          } as Prisma.InputJsonValue,
          type: "SETTINGS_CHANGED",
        },
      });
    });
    return this.loadDetail(id);
  }

  /**
   * Makes a version live: the open draft by default, or a named draft / coach
   * submission, or — to republish an unpublished article unchanged — its last
   * published version. The previous live version becomes SUPERSEDED.
   */
  async publish(
    accessToken: string | undefined,
    id: string,
    body: PublishKnowledgeRequest,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const article = await this.findArticle(tx, id);
      const version = body.versionId
        ? await tx.knowledgeArticleVersion.findFirst({ where: { articleId: id, id: body.versionId } })
        : await tx.knowledgeArticleVersion.findFirst({
            orderBy: { number: "desc" },
            where: { articleId: id, status: "DRAFT" },
          });
      if (!version) throw new NotFoundException(body.versionId ? "That version could not be found." : "There is no draft to publish.");
      if (!article.audience.length) throw new BadRequestException("Choose who this article is for before publishing it.");

      if (version.status === "PUBLISHED") {
        if (article.status === "PUBLISHED") throw new ConflictException("That version is already live.");
        // Its content was already reviewed; only the source credit (which may have changed since) is checked.
        this.assertPublishable(version, article, true);
        await tx.knowledgeArticle.update({ data: { status: "PUBLISHED" }, where: { id } });
        await tx.knowledgeArticleEvent.create({
          data: { actorId: user.id, articleId: id, detail: { republished: true }, type: "PUBLISHED", versionId: version.id },
        });
        return;
      }
      if (version.status !== "DRAFT" && version.status !== "SUBMITTED") {
        throw new ConflictException("Only a draft or a coach suggestion can be published. Use rollback for an old version.");
      }
      this.assertPublishable(version, article, body.acknowledgeWarnings ?? false);
      await this.makeLive(tx, article.id, article.publishedVersionId, version.id, user.id, {
        changeNote: body.changeNote ?? version.changeNote,
        reviewed: version.status === "SUBMITTED",
      });
      await tx.knowledgeArticleEvent.create({
        data: {
          actorId: user.id,
          articleId: id,
          detail: version.warnings.length ? ({ acknowledgedWarnings: version.warnings } as Prisma.InputJsonValue) : undefined,
          type: "PUBLISHED",
          versionId: version.id,
        },
      });
    });
    return this.loadDetail(id);
  }

  /** Hidden from readers; the last published version is kept for republishing. */
  async unpublish(accessToken: string | undefined, id: string): Promise<KnowledgeAdminArticleDetail> {
    return this.setStatus(accessToken, id, "DRAFT", "UNPUBLISHED", ["PUBLISHED"]);
  }

  async archive(accessToken: string | undefined, id: string): Promise<KnowledgeAdminArticleDetail> {
    return this.setStatus(accessToken, id, "ARCHIVED", "ARCHIVED", ["DRAFT", "PUBLISHED"]);
  }

  /** Back to how it was: live again if it had a published version, else a draft. */
  async restore(accessToken: string | undefined, id: string): Promise<KnowledgeAdminArticleDetail> {
    // Authenticate before reading the article, so the credit check can't tell outsiders anything.
    await this.getStaff(accessToken);
    const article = await this.prisma.knowledgeArticle.findUnique({
      select: { publishedVersionId: true, sourceNote: true, sourceType: true },
      where: { id },
    });
    // Going straight back live must pass the same OD-7 credit check as a publish.
    if (article?.publishedVersionId) this.assertPublishable({ warnings: [] }, article, true);
    return this.setStatus(accessToken, id, article?.publishedVersionId ? "PUBLISHED" : "DRAFT", "RESTORED", ["ARCHIVED"]);
  }

  /** Copies an old version into a new one and makes it live, so history only grows. */
  async rollback(
    accessToken: string | undefined,
    id: string,
    body: RollbackKnowledgeRequest,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const article = await this.findArticle(tx, id);
      const target = await tx.knowledgeArticleVersion.findFirst({ where: { articleId: id, id: body.versionId } });
      if (!target) throw new NotFoundException("That version could not be found.");
      if (target.status !== "SUPERSEDED" && target.status !== "PUBLISHED") {
        throw new ConflictException("Only a version that was once live can be rolled back to.");
      }
      if (target.id === article.publishedVersionId) throw new ConflictException("That version is already the live one.");
      if (!article.audience.length) throw new BadRequestException("Choose who this article is for before publishing it.");
      const bumped = await tx.knowledgeArticle.update({ data: { latestVersionNumber: { increment: 1 } }, where: { id } });
      const copy = await tx.knowledgeArticleVersion.create({
        data: {
          articleId: id,
          authorId: user.id,
          body: target.body,
          changeNote: body.changeNote ?? `Rolled back to version ${target.number}`,
          number: bumped.latestVersionNumber,
          pgn: target.pgn,
          resourceRef: target.resourceRef,
          resourceType: target.resourceType,
          summary: target.summary,
          title: target.title,
          warnings: detectKnowledgeWarnings({ ...target, sourceNote: article.sourceNote, sourceType: article.sourceType }),
        },
      });
      this.assertPublishable(copy, article, true);
      await this.makeLive(tx, id, article.publishedVersionId, copy.id, user.id, { changeNote: copy.changeNote, reviewed: false });
      await tx.knowledgeArticleEvent.create({
        data: {
          actorId: user.id,
          articleId: id,
          detail: { fromVersion: target.number, toVersion: copy.number },
          type: "ROLLED_BACK",
          versionId: copy.id,
        },
      });
    });
    return this.loadDetail(id);
  }

  async reject(
    accessToken: string | undefined,
    id: string,
    body: RejectKnowledgeRequest,
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.knowledgeArticleVersion.updateMany({
        data: { reviewNote: body.note, reviewedAt: new Date(), reviewedById: user.id, status: "REJECTED" },
        where: { articleId: id, id: body.versionId, status: "SUBMITTED" },
      });
      if (!count) throw new NotFoundException("That suggestion is no longer waiting for review.");
      await tx.knowledgeArticleEvent.create({
        data: { actorId: user.id, articleId: id, detail: { note: body.note }, type: "REJECTED", versionId: body.versionId },
      });
    });
    return this.loadDetail(id);
  }

  /** Permanent: the article, every version, its change log and votes. Super admin only. */
  async remove(accessToken: string | undefined, id: string): Promise<{ ok: true }> {
    const user = await this.getStaff(accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only a super admin can delete an article permanently. Archive it instead.");
    }
    const { count } = await this.prisma.knowledgeArticle.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException("That article could not be found.");
    return { ok: true };
  }

  async diff(accessToken: string | undefined, id: string, fromId: string, toId: string): Promise<KnowledgeVersionDiffResponse> {
    await this.getStaff(accessToken);
    const versions = await this.prisma.knowledgeArticleVersion.findMany({
      include: versionInclude,
      where: { articleId: id, id: { in: [fromId, toId] } },
    });
    const from = versions.find((v) => v.id === fromId);
    const to = versions.find((v) => v.id === toId);
    if (!from || !to) throw new NotFoundException("Those versions could not be found.");
    return {
      from: toVersionSummary(from),
      lines: diffKnowledgeLines(knowledgeVersionText(from), knowledgeVersionText(to)),
      to: toVersionSummary(to),
    };
  }

  async submissions(accessToken: string | undefined): Promise<KnowledgeSubmissionsResponse> {
    await this.getStaff(accessToken);
    const rows = await this.prisma.knowledgeArticleVersion.findMany({
      include: {
        ...versionInclude,
        article: { select: { id: true, kind: true, publishedVersion: { select: { title: true } }, slug: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      where: { status: "SUBMITTED" },
    });
    return {
      submissions: rows.map((v) => ({
        articleId: v.article.id,
        articleKind: v.article.kind,
        articleSlug: v.article.slug,
        articleTitle: v.article.publishedVersion?.title ?? null,
        isNewArticle: v.number === 1,
        version: toVersionDto(v),
      })),
    };
  }

  // ── Categories ────────────────────────────────────────────────────────────

  async categories(accessToken: string | undefined): Promise<{ categories: KnowledgeCategoryDto[] }> {
    await this.getStaff(accessToken);
    const rows = await this.prisma.knowledgeCategory.findMany({
      include: { _count: { select: { articles: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { categories: rows.map((c) => this.toCategory(c)) };
  }

  async createCategory(accessToken: string | undefined, body: KnowledgeCategoryRequest): Promise<KnowledgeCategoryDto> {
    await this.getStaff(accessToken);
    const created = await this.prisma.knowledgeCategory
      .create({
        data: { description: body.description ?? null, name: body.name, sortOrder: body.sortOrder ?? 0 },
        include: { _count: { select: { articles: true } } },
      })
      .catch(rethrowDuplicateName);
    return this.toCategory(created);
  }

  async updateCategory(
    accessToken: string | undefined,
    id: string,
    body: UpdateKnowledgeCategoryRequest,
  ): Promise<KnowledgeCategoryDto> {
    await this.getStaff(accessToken);
    const exists = await this.prisma.knowledgeCategory.findUnique({ select: { id: true }, where: { id } });
    if (!exists) throw new NotFoundException("That category could not be found.");
    const updated = await this.prisma.knowledgeCategory
      .update({
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
        },
        include: { _count: { select: { articles: true } } },
        where: { id },
      })
      .catch(rethrowDuplicateName);
    return this.toCategory(updated);
  }

  async deleteCategory(accessToken: string | undefined, id: string): Promise<{ ok: true }> {
    await this.getStaff(accessToken);
    const row = await this.prisma.knowledgeCategory.findUnique({
      include: { _count: { select: { articles: true } } },
      where: { id },
    });
    if (!row) throw new NotFoundException("That category could not be found.");
    if (row._count.articles) {
      throw new ConflictException("Move this category's articles first, or archive the category instead.");
    }
    await this.prisma.knowledgeCategory.delete({ where: { id } });
    return { ok: true };
  }

  // ── Insights (unanswered inbox, top queries, not-helpful articles) ────────

  async insights(accessToken: string | undefined): Promise<KnowledgeInsightsResponse> {
    await this.getStaff(accessToken);
    const since = new Date(Date.now() - KNOWLEDGE_TREND_DAYS * DAY_MS);
    const logs = await this.prisma.knowledgeSearchLog.findMany({
      select: { createdAt: true, query: true, resolution: true, resultCount: true, role: true },
      take: 50_000,
      where: { createdAt: { gte: since } },
    });
    const group = (rows: typeof logs): KnowledgeQueryInsight[] => {
      const by = new Map<string, KnowledgeQueryInsight>();
      for (const row of rows) {
        const entry = by.get(row.query) ?? { count: 0, lastAskedAt: row.createdAt.toISOString(), query: row.query, roles: [] };
        entry.count += 1;
        if (row.createdAt.toISOString() > entry.lastAskedAt) entry.lastAskedAt = row.createdAt.toISOString();
        if (!entry.roles.includes(row.role)) entry.roles.push(row.role);
        by.set(row.query, entry);
      }
      return [...by.values()].sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt)).slice(0, 50);
    };
    const unansweredRows = logs.filter((l) => l.resultCount === 0 && !l.resolution);

    const votes = await this.prisma.knowledgeFeedback.groupBy({
      _count: { _all: true },
      by: ["articleId", "helpful"],
    });
    const tally = new Map<string, { helpful: number; notHelpful: number }>();
    for (const v of votes) {
      const t = tally.get(v.articleId) ?? { helpful: 0, notHelpful: 0 };
      if (v.helpful) t.helpful += v._count._all;
      else t.notHelpful += v._count._all;
      tally.set(v.articleId, t);
    }
    const worstIds = [...tally.entries()]
      .filter(([, t]) => t.notHelpful > 0)
      .sort((a, b) => b[1].notHelpful - a[1].notHelpful)
      .slice(0, 20)
      .map(([id]) => id);
    const worst = worstIds.length
      ? await this.prisma.knowledgeArticle.findMany({
          select: { id: true, publishedVersion: { select: { title: true } }, slug: true },
          where: { id: { in: worstIds } },
        })
      : [];
    return {
      days: KNOWLEDGE_TREND_DAYS,
      notHelpful: worstIds
        .map((id) => worst.find((w) => w.id === id))
        .filter((w): w is (typeof worst)[number] => !!w)
        .map((w) => ({ id: w.id, slug: w.slug, title: w.publishedVersion?.title ?? w.slug, ...tally.get(w.id)! })),
      topQueries: group(logs).slice(0, 25),
      totals: { searches: logs.length, unanswered: unansweredRows.length },
      unanswered: group(unansweredRows),
    };
  }

  /** Marks every unresolved log of a query answered (by an article) or dismissed. */
  async resolveQuery(accessToken: string | undefined, body: ResolveKnowledgeQueryRequest): Promise<{ updated: number }> {
    await this.getStaff(accessToken);
    if (body.articleId) {
      const exists = await this.prisma.knowledgeArticle.findUnique({ select: { id: true }, where: { id: body.articleId } });
      if (!exists) throw new NotFoundException("That article could not be found.");
    }
    const { count } = await this.prisma.knowledgeSearchLog.updateMany({
      data: { resolution: body.resolution, resolvedArticleId: body.articleId ?? null, resolvedAt: new Date() },
      where: { query: normalizeKnowledgeQuery(body.query), resolution: null },
    });
    return { updated: count };
  }

  // ── Import / export ───────────────────────────────────────────────────────

  /** Every non-archived article: its live version, or its draft if never published. */
  async exportAll(accessToken: string | undefined): Promise<KnowledgeExportFile> {
    await this.getStaff(accessToken);
    const rows = await this.prisma.knowledgeArticle.findMany({
      include: {
        category: { select: { name: true } },
        publishedVersion: true,
        versions: { orderBy: { number: "desc" }, take: 1, where: { status: "DRAFT" } },
      },
      orderBy: { createdAt: "asc" },
      where: { status: { not: "ARCHIVED" } },
    });
    return {
      exportedAt: new Date().toISOString(),
      format: "nexa-knowledge-export",
      items: rows
        .map((r) => ({ row: r, version: r.publishedVersion ?? r.versions[0] }))
        .filter((x) => !!x.version)
        .map(({ row, version }) => ({
          category: row.category?.name ?? null,
          content: {
            body: version!.body,
            pgn: version!.pgn,
            resourceRef: version!.resourceRef,
            resourceType: version!.resourceType,
            summary: version!.summary,
            title: version!.title,
          },
          settings: {
            audience: row.audience,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            kind: row.kind,
            language: row.language,
            publishAt: row.publishAt?.toISOString() ?? null,
            reviewBy: row.reviewBy?.toISOString() ?? null,
            routeTags: row.routeTags,
            sourceNote: row.sourceNote,
            sourceType: row.sourceType,
          },
          slug: row.slug,
        })),
      version: 1,
    };
  }

  /**
   * Each item becomes a new article with a DRAFT version: nothing imported goes
   * live unreviewed. Every item is validated first and all of them are written in
   * one transaction, so a failed import leaves nothing behind to duplicate on retry.
   */
  async importItems(accessToken: string | undefined, body: KnowledgeImportRequest): Promise<KnowledgeImportResponse> {
    const user = await this.getStaff(accessToken);
    const parsed = parseOrBadRequest(knowledgeImportSchema, body);
    const items = parsed.items.map((item) => ({
      category: item.category,
      content: parseOrBadRequest(knowledgeContentSchema, item.content),
      settings: parseOrBadRequest(knowledgeSettingsSchema, {
        audience: [],
        batchIds: [],
        kind: "ARTICLE",
        routeTags: [],
        ...item.settings,
        categoryId: null,
        translationOfId: null,
      }),
      slug: item.slug,
    }));
    const articleIds = await this.prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        const categoryIds = new Map<string, string>();
        for (const item of items) {
          let categoryId: string | null = null;
          if (item.category) {
            const key = item.category.toLowerCase();
            if (!categoryIds.has(key)) {
              const existing = await tx.knowledgeCategory.findFirst({
                select: { id: true },
                where: { name: { equals: item.category, mode: "insensitive" } },
              });
              categoryIds.set(key, existing?.id ?? (await tx.knowledgeCategory.create({ data: { name: item.category } })).id);
            }
            categoryId = categoryIds.get(key)!;
          }
          const settings = { ...item.settings, categoryId };
          // Inside the transaction, so two items with the same title get distinct slugs.
          const slug = await uniqueKnowledgeSlug(tx, slugifyKnowledgeTitle(item.slug || item.content.title));
          const article = await tx.knowledgeArticle.create({
            data: { ...this.settingsData(settings), createdById: user.id, latestVersionNumber: 1, slug },
          });
          const version = await tx.knowledgeArticleVersion.create({
            data: { ...this.contentData(item.content, settings), articleId: article.id, authorId: user.id, number: 1 },
          });
          await tx.knowledgeArticleEvent.create({
            data: { actorId: user.id, articleId: article.id, detail: { imported: true }, type: "CREATED", versionId: version.id },
          });
          ids.push(article.id);
        }
        return ids;
      },
      // Up to KNOWLEDGE_IMPORT_MAX items at ~5 statements each.
      { timeout: 60_000 },
    );
    return { articleIds, created: articleIds.length };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async setStatus(
    accessToken: string | undefined,
    id: string,
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
    event: "UNPUBLISHED" | "ARCHIVED" | "RESTORED",
    from: ("DRAFT" | "PUBLISHED" | "ARCHIVED")[],
  ): Promise<KnowledgeAdminArticleDetail> {
    const user = await this.getStaff(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.knowledgeArticle.updateMany({ data: { status }, where: { id, status: { in: from } } });
      if (!count) {
        const exists = await tx.knowledgeArticle.findUnique({ select: { status: true }, where: { id } });
        if (!exists) throw new NotFoundException("That article could not be found.");
        throw new ConflictException(`The article is ${exists.status.toLowerCase()}; that can't be done now.`);
      }
      await tx.knowledgeArticleEvent.create({ data: { actorId: user.id, articleId: id, type: event } });
    });
    return this.loadDetail(id);
  }

  private async makeLive(
    tx: Tx,
    articleId: string,
    previousId: string | null,
    versionId: string,
    actorId: string,
    opts: { changeNote: string | null; reviewed: boolean },
  ) {
    const now = new Date();
    if (previousId) {
      await tx.knowledgeArticleVersion.updateMany({
        data: { status: "SUPERSEDED" },
        where: { id: previousId, status: "PUBLISHED" },
      });
    }
    const { count } = await tx.knowledgeArticleVersion.updateMany({
      data: {
        changeNote: opts.changeNote,
        publishedAt: now,
        status: "PUBLISHED",
        ...(opts.reviewed ? { reviewedAt: now, reviewedById: actorId } : {}),
      },
      // Claim: still publishable (a concurrent publish or reject loses here).
      where: { id: versionId, status: { in: ["DRAFT", "SUBMITTED"] } },
    });
    if (!count) throw new ConflictException("That version changed while you were publishing it. Reload and try again.");
    await tx.knowledgeArticle.update({
      data: { publishedVersionId: versionId, status: "PUBLISHED" },
      where: { id: articleId },
    });
  }

  private assertPublishable(
    version: { warnings: string[] },
    article: { sourceType: string; sourceNote: string | null },
    acknowledged: boolean,
  ) {
    if ((article.sourceType === "CC_BY" || article.sourceType === "PERMISSION") && !article.sourceNote?.trim()) {
      throw new BadRequestException("Add the credit / licence note for this source before publishing (OD-7).");
    }
    const flags = version.warnings.filter((w) => w !== "missing-credit");
    if (flags.length && !acknowledged) {
      throw new ConflictException(
        `This version was flagged (${flags.join(", ")}). Check it, then publish again with the warnings acknowledged.`,
      );
    }
  }

  private async findArticle(tx: Tx, id: string) {
    const article = await tx.knowledgeArticle.findUnique({ include: { batches: { select: { batchId: true } } }, where: { id } });
    if (!article) throw new NotFoundException("That article could not be found.");
    return article;
  }

  private async assertSettingsRefs(settings: KnowledgeSettingsInput, selfId?: string) {
    if (settings.categoryId) {
      const category = await this.prisma.knowledgeCategory.findUnique({ select: { id: true }, where: { id: settings.categoryId } });
      if (!category) throw new BadRequestException("That category doesn't exist.");
    }
    if (settings.batchIds.length) {
      const found = await this.prisma.batch.count({ where: { id: { in: settings.batchIds } } });
      if (found !== new Set(settings.batchIds).size) throw new BadRequestException("One of those batches doesn't exist.");
    }
    if (settings.translationOfId) {
      if (settings.translationOfId === selfId) throw new BadRequestException("An article can't be a translation of itself.");
      const target = await this.prisma.knowledgeArticle.findUnique({ select: { id: true }, where: { id: settings.translationOfId } });
      if (!target) throw new BadRequestException("The article this translates doesn't exist.");
    }
  }

  /**
   * The group a translation joins: the target's group, or a new one keyed by
   * the target's id. No `translationOfId` = not a translation of anything (the
   * settings form sends one of the current siblings to stay in a group).
   */
  private async translationGroupFor(tx: Tx, translationOfId: string | null): Promise<string | null> {
    if (!translationOfId) return null;
    const target = await tx.knowledgeArticle.findUniqueOrThrow({
      select: { id: true, translationGroupId: true },
      where: { id: translationOfId },
    });
    if (target.translationGroupId) return target.translationGroupId;
    await tx.knowledgeArticle.update({ data: { translationGroupId: target.id }, where: { id: target.id } });
    return target.id;
  }

  private settingsData(settings: KnowledgeSettingsInput) {
    return {
      audience: [...new Set(settings.audience)],
      batchScoped: settings.batchIds.length > 0,
      categoryId: settings.categoryId,
      expiresAt: settings.expiresAt ? new Date(settings.expiresAt) : null,
      kind: settings.kind,
      language: settings.language,
      publishAt: settings.publishAt ? new Date(settings.publishAt) : null,
      reviewBy: settings.reviewBy ? new Date(settings.reviewBy) : null,
      routeTags: [...new Set(settings.routeTags)],
      sourceNote: settings.sourceNote,
      sourceType: settings.sourceType,
    };
  }

  private contentData(content: KnowledgeContentInput, source: { sourceType: string; sourceNote: string | null }) {
    return {
      body: content.body,
      changeNote: content.changeNote,
      pgn: content.pgn,
      resourceRef: content.resourceRef,
      resourceType: content.resourceType,
      summary: content.summary,
      title: content.title,
      warnings: detectKnowledgeWarnings({
        ...content,
        sourceNote: source.sourceNote,
        sourceType: source.sourceType as KnowledgeSettingsInput["sourceType"],
      }),
    };
  }

  private async voteCounts(ids: string[]) {
    const map = new Map<string, { helpful: number; notHelpful: number }>();
    if (!ids.length) return map;
    const rows = await this.prisma.knowledgeFeedback.groupBy({
      _count: { _all: true },
      by: ["articleId", "helpful"],
      where: { articleId: { in: ids } },
    });
    for (const r of rows) {
      const t = map.get(r.articleId) ?? { helpful: 0, notHelpful: 0 };
      if (r.helpful) t.helpful += r._count._all;
      else t.notHelpful += r._count._all;
      map.set(r.articleId, t);
    }
    return map;
  }

  private toSummary(
    row: ListRow,
    votes: { helpful: number; notHelpful: number } | undefined,
    now: Date,
  ): KnowledgeAdminArticleSummary {
    const draft = row.versions[0] ?? null;
    return {
      audience: row.audience,
      batchIds: [],
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      hasDraft: !!draft,
      helpful: votes?.helpful ?? 0,
      id: row.id,
      kind: row.kind,
      language: row.language,
      latestVersionNumber: row.latestVersionNumber,
      live: isKnowledgeArticleLive(
        {
          audience: row.audience,
          batchIds: [],
          batchScoped: row.batchScoped,
          expiresAt: row.expiresAt,
          hasPublishedVersion: !!row.publishedVersionId,
          publishAt: row.publishAt,
          status: row.status,
        },
        now,
      ) && row.audience.length > 0,
      notHelpful: votes?.notHelpful ?? 0,
      pendingSubmissions: row._count.versions,
      publishAt: row.publishAt?.toISOString() ?? null,
      publishedVersionNumber: row.publishedVersion?.number ?? null,
      reviewBy: row.reviewBy?.toISOString() ?? null,
      routeTags: row.routeTags,
      slug: row.slug,
      sourceNote: row.sourceNote,
      sourceType: row.sourceType,
      status: row.status,
      title: draft?.title ?? row.publishedVersion?.title ?? row.slug,
      translationGroupId: row.translationGroupId,
      updatedAt: row.updatedAt.toISOString(),
      warnings: [...new Set([...(row.publishedVersion?.warnings ?? []), ...(draft?.warnings ?? [])])],
    };
  }

  private async loadDetail(id: string): Promise<KnowledgeAdminArticleDetail> {
    const row = await this.prisma.knowledgeArticle.findUnique({
      include: {
        ...listInclude,
        batches: { include: { batch: { select: { id: true, name: true } } } },
        events: {
          include: { actor: { select: { firstName: true, id: true, lastName: true } }, version: { select: { number: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        },
        publishedVersion: { include: versionInclude },
      },
      where: { id },
    });
    if (!row) throw new NotFoundException("That article could not be found.");
    const [versions, draft, translations, votes] = await Promise.all([
      this.prisma.knowledgeArticleVersion.findMany({ include: versionInclude, orderBy: { number: "desc" }, where: { articleId: id } }),
      this.prisma.knowledgeArticleVersion.findFirst({
        include: versionInclude,
        orderBy: { number: "desc" },
        where: { articleId: id, status: "DRAFT" },
      }),
      row.translationGroupId
        ? this.prisma.knowledgeArticle.findMany({
            include: {
              publishedVersion: { select: { title: true } },
              versions: { orderBy: { number: "desc" }, select: { title: true }, take: 1 },
            },
            where: { id: { not: id }, translationGroupId: row.translationGroupId },
          })
        : Promise.resolve([]),
      this.voteCounts([id]),
    ]);
    const summary = this.toSummary(
      { ...row, publishedVersion: row.publishedVersion, versions: draft ? [draft] : [] } as unknown as ListRow,
      votes.get(id),
      new Date(),
    );
    return {
      ...summary,
      batchIds: row.batches.map((b) => b.batchId),
      batches: row.batches.map((b) => b.batch),
      draft: draft ? toVersionDto(draft) : null,
      events: row.events.map(
        (e): KnowledgeEventDto => ({
          actor: e.actor ? { id: e.actor.id, name: personName(e.actor) } : null,
          createdAt: e.createdAt.toISOString(),
          detail: (e.detail as Record<string, unknown> | null) ?? null,
          id: e.id,
          type: e.type,
          versionNumber: e.version?.number ?? null,
        }),
      ),
      published: row.publishedVersion ? toVersionDto(row.publishedVersion) : null,
      translations: translations.map((t) => ({
        id: t.id,
        language: t.language,
        slug: t.slug,
        title: t.publishedVersion?.title ?? t.versions[0]?.title ?? t.slug,
      })),
      versions: versions.map(toVersionSummary),
    };
  }

  private toCategory(c: Prisma.KnowledgeCategoryGetPayload<{ include: { _count: { select: { articles: true } } } }>): KnowledgeCategoryDto {
    return {
      archived: c.archivedAt !== null,
      articleCount: c._count.articles,
      description: c.description,
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
    };
  }

  private async getStaff(accessToken: string | undefined): Promise<KnowledgeActor> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException("Only admins can manage the knowledge base.");
    return { id: user.id, role: user.role };
  }
}

function snapshot(
  a: {
    audience: KnowledgeAudience[];
    categoryId: string | null;
    expiresAt: Date | null;
    kind: string;
    language: string;
    publishAt: Date | null;
    reviewBy: Date | null;
    routeTags: string[];
    sourceNote: string | null;
    sourceType: string;
    translationGroupId: string | null;
  },
  batchIds: string[],
): SettingsSnapshot {
  return {
    audience: [...a.audience].sort(),
    batchIds: [...batchIds].sort(),
    categoryId: a.categoryId,
    expiresAt: a.expiresAt?.toISOString() ?? null,
    kind: a.kind,
    language: a.language,
    publishAt: a.publishAt?.toISOString() ?? null,
    reviewBy: a.reviewBy?.toISOString() ?? null,
    routeTags: [...a.routeTags].sort(),
    sourceNote: a.sourceNote,
    sourceType: a.sourceType,
    translationGroupId: a.translationGroupId,
  };
}

function rethrowDuplicateName(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictException("A category with that name already exists.");
  }
  throw err;
}
