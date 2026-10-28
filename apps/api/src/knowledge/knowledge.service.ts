import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  KNOWLEDGE_SEARCH_LIMIT,
  KNOWLEDGE_TREND_DAYS,
  KNOWLEDGE_TREND_MIN_BATCH_SIZE,
  KNOWLEDGE_TREND_MIN_COUNT,
  detectKnowledgeWarnings,
  isKnowledgeStaff,
  knowledgeRouteMatches,
  normalizeKnowledgeQuery,
  slugifyKnowledgeTitle,
  type KnowledgeCoachTrendsResponse,
  type KnowledgeContentInput,
  type KnowledgeHelpArticle,
  type KnowledgeHelpArticleSummary,
  type KnowledgeHelpQuery,
  type KnowledgeHelpResponse,
  type KnowledgePreviewQuery,
  type KnowledgeSubmissionDto,
  type KnowledgeSubmissionsResponse,
  type KnowledgeUserRole,
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import {
  assertReadable,
  readerForUser,
  readerWhere,
  toVersionDto,
  versionInclude,
  type KnowledgeActor,
  type KnowledgeReader,
} from "./knowledge.shared";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A coach may have this many suggestions waiting at once. */
export const MAX_PENDING_SUGGESTIONS = 20;
/** Searches shorter than this are not logged (keystrokes, not questions). */
const MIN_LOGGED_QUERY = 3;
const SNIPPET_RADIUS = 90;

const summaryInclude = {
  category: { select: { name: true } },
  // No body: the help list holds every visible row; snippets load bodies for the shown page only.
  publishedVersion: { select: { summary: true, title: true } },
} satisfies Prisma.KnowledgeArticleInclude;

type SummaryRow = Prisma.KnowledgeArticleGetPayload<{ include: typeof summaryInclude }>;

/**
 * The help centre (every signed-in role), coach suggestions and coach topic
 * trends. Reads only ever see live, published versions an article's audience
 * allows (`readerWhere`); admin authoring is `KnowledgeAdminService`.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Help centre ───────────────────────────────────────────────────────────

  async help(accessToken: string | undefined, query: KnowledgeHelpQuery): Promise<KnowledgeHelpResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const reader = await readerForUser(this.prisma, user);
    return this.helpFor(reader, query, true);
  }

  /** Staff: the help centre exactly as a role (and optionally one batch) sees it. Never logged. */
  async preview(accessToken: string | undefined, query: KnowledgePreviewQuery): Promise<KnowledgeHelpResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (!isKnowledgeStaff(user.role as KnowledgeUserRole)) throw new ForbiddenException("Staff only.");
    const reader: KnowledgeReader = { audience: query.asRole, batchIds: query.batchId ? [query.batchId] : [] };
    return this.helpFor(reader, query, false);
  }

  /** Also the assistant tool `knowledge.search` (knowledge.tools.ts). */
  async helpFor(reader: KnowledgeReader, query: KnowledgeHelpQuery, log: boolean): Promise<KnowledgeHelpResponse> {
    const now = new Date();
    const where: Prisma.KnowledgeArticleWhereInput = {
      AND: [
        readerWhere(reader, now),
        query.language ? { language: query.language } : {},
      ],
    };
    const visible = await this.prisma.knowledgeArticle.findMany({
      include: summaryInclude,
      orderBy: { updatedAt: "desc" },
      take: 1000,
      where,
    });
    const route = query.route;
    const forPage = (row: SummaryRow) => !!route && row.routeTags.some((tag) => knowledgeRouteMatches(tag, route));

    // Counts and chips come from every visible row, so picking a category keeps the others on offer.
    const categoryCounts = new Map<string, number>();
    for (const row of visible) if (row.categoryId) categoryCounts.set(row.categoryId, (categoryCounts.get(row.categoryId) ?? 0) + 1);
    const categories = categoryCounts.size
      ? await this.prisma.knowledgeCategory.findMany({
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          where: { archivedAt: null, id: { in: [...categoryCounts.keys()] } },
        })
      : [];

    const inCategory = query.categoryId ? visible.filter((r) => r.categoryId === query.categoryId) : visible;
    const q = query.q?.trim() ?? "";
    let articles: KnowledgeHelpArticleSummary[];
    if (q) {
      const ranked = await this.rank(
        inCategory.map((r) => r.id),
        q,
      );
      const byId = new Map(inCategory.map((r) => [r.id, r]));
      const shown = ranked
        .map((id) => byId.get(id))
        .filter((r): r is SummaryRow => !!r)
        // Page-tagged matches first, keeping text rank inside each group.
        .sort((a, b) => Number(forPage(b)) - Number(forPage(a)))
        .slice(0, KNOWLEDGE_SEARCH_LIMIT);
      const bodies = await this.publishedBodies(shown);
      articles = shown.map((r) => this.toSummary(r, forPage(r), q, bodies.get(r.id)));
      if (log && normalizeKnowledgeQuery(q).length >= MIN_LOGGED_QUERY) {
        await this.prisma.knowledgeSearchLog.create({
          data: {
            batchIds: reader.batchIds,
            query: normalizeKnowledgeQuery(q),
            resultCount: articles.length,
            role: reader.audience,
            route: route ?? null,
          },
        });
      }
    } else {
      const sortKey = new Map(categories.map((c, i) => [c.id, i]));
      articles = [...inCategory]
        .sort(
          (a, b) =>
            (sortKey.get(a.categoryId ?? "") ?? 1e6) - (sortKey.get(b.categoryId ?? "") ?? 1e6) ||
            (a.publishedVersion?.title ?? "").localeCompare(b.publishedVersion?.title ?? ""),
        )
        .map((r) => this.toSummary(r, forPage(r), null));
    }

    return {
      articles,
      categories: categories.map((c) => ({
        articleCount: categoryCounts.get(c.id) ?? 0,
        description: c.description,
        id: c.id,
        name: c.name,
      })),
      forThisPage: route ? inCategory.filter(forPage).slice(0, 8).map((r) => this.toSummary(r, true, null)) : [],
      searched: !!q,
    };
  }

  async article(accessToken: string | undefined, slug: string): Promise<KnowledgeHelpArticle> {
    const user = await this.getAuthenticatedUser(accessToken);
    const reader = await readerForUser(this.prisma, user);
    return this.articleFor(reader, slug, user.id);
  }

  /** Also the assistant tool `knowledge.get_article`. A hidden article is a 404, so slugs can't be probed. */
  async articleFor(reader: KnowledgeReader, slug: string, userId: string | null): Promise<KnowledgeHelpArticle> {
    const now = new Date();
    const row = await this.prisma.knowledgeArticle.findFirst({
      include: {
        ...summaryInclude,
        batches: { select: { batchId: true } },
        publishedVersion: { include: versionInclude },
      },
      where: { AND: [readerWhere(reader, now), { slug }] },
    });
    if (!row || !row.publishedVersion || !assertReadable(reader, row, now)) {
      throw new NotFoundException("That help article could not be found.");
    }
    const version = row.publishedVersion;
    const [translations, related, feedback] = await Promise.all([
      row.translationGroupId
        ? this.prisma.knowledgeArticle.findMany({
            include: { publishedVersion: { select: { title: true } } },
            where: { AND: [readerWhere(reader, now), { id: { not: row.id }, translationGroupId: row.translationGroupId }] },
          })
        : Promise.resolve([]),
      row.categoryId
        ? this.prisma.knowledgeArticle.findMany({
            include: summaryInclude,
            orderBy: { updatedAt: "desc" },
            take: 5,
            where: {
              AND: [
                readerWhere(reader, now),
                { categoryId: row.categoryId, id: { not: row.id } },
                row.translationGroupId ? { NOT: { translationGroupId: row.translationGroupId } } : {},
              ],
            },
          })
        : Promise.resolve([]),
      userId
        ? this.prisma.knowledgeFeedback.findUnique({
            select: { helpful: true },
            where: { articleId_userId: { articleId: row.id, userId } },
          })
        : Promise.resolve(null),
    ]);
    return {
      ...this.toSummary(row, false, null),
      body: version.body,
      myFeedback: feedback?.helpful ?? null,
      pgn: version.pgn,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      related: related.map((r) => this.toSummary(r, false, null)),
      resourceRef: version.resourceRef,
      resourceType: version.resourceType,
      sourceNote: row.sourceNote,
      sourceType: row.sourceType,
      summary: version.summary,
      title: version.title,
      translations: translations.map((t) => ({
        language: t.language,
        slug: t.slug,
        title: t.publishedVersion?.title ?? t.slug,
      })),
      versionNumber: version.number,
    };
  }

  async feedback(accessToken: string | undefined, articleId: string, helpful: boolean): Promise<{ ok: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    const reader = await readerForUser(this.prisma, user);
    const now = new Date();
    const row = await this.prisma.knowledgeArticle.findFirst({
      select: { id: true, publishedVersionId: true },
      where: { AND: [readerWhere(reader, now), { id: articleId }] },
    });
    if (!row) throw new NotFoundException("That help article could not be found.");
    await this.prisma.knowledgeFeedback.upsert({
      create: { articleId: row.id, helpful, userId: user.id, versionId: row.publishedVersionId },
      update: { helpful, versionId: row.publishedVersionId },
      where: { articleId_userId: { articleId: row.id, userId: user.id } },
    });
    return { ok: true };
  }

  // ── Coach suggestions ─────────────────────────────────────────────────────

  async mySuggestions(accessToken: string | undefined): Promise<KnowledgeSubmissionsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCoach(user);
    const rows = await this.prisma.knowledgeArticleVersion.findMany({
      include: {
        ...versionInclude,
        article: { select: { id: true, kind: true, publishedVersion: { select: { title: true } }, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { authorId: user.id, status: { in: ["SUBMITTED", "REJECTED", "PUBLISHED", "SUPERSEDED"] } },
    });
    return {
      submissions: rows.map(
        (v): KnowledgeSubmissionDto => ({
          articleId: v.article.id,
          articleKind: v.article.kind,
          articleSlug: v.article.slug,
          articleTitle: v.article.publishedVersion?.title ?? null,
          isNewArticle: v.number === 1,
          version: toVersionDto(v),
        }),
      ),
    };
  }

  /**
   * A coach proposes a new article, or an edit of one they can read. It is a
   * SUBMITTED version: invisible to readers until an admin publishes it.
   */
  async suggest(
    accessToken: string | undefined,
    articleId: string | undefined,
    content: KnowledgeContentInput,
  ): Promise<KnowledgeSubmissionDto> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCoach(user);
    const pending = await this.prisma.knowledgeArticleVersion.count({
      where: { authorId: user.id, status: "SUBMITTED" },
    });
    if (pending >= MAX_PENDING_SUGGESTIONS) {
      throw new ConflictException(`You already have ${MAX_PENDING_SUGGESTIONS} suggestions waiting for review.`);
    }
    const warnings = detectKnowledgeWarnings(content);
    const data = {
      authorId: user.id,
      body: content.body,
      changeNote: content.changeNote,
      pgn: content.pgn,
      resourceRef: content.resourceRef,
      resourceType: content.resourceType,
      status: "SUBMITTED" as const,
      summary: content.summary,
      title: content.title,
      warnings,
    };

    if (articleId) {
      const reader = await readerForUser(this.prisma, user);
      const visible = await this.prisma.knowledgeArticle.findFirst({
        select: { id: true },
        where: { AND: [readerWhere(reader, new Date()), { id: articleId }] },
      });
      if (!visible) throw new NotFoundException("That help article could not be found.");
      const version = await this.prisma.$transaction(async (tx) => {
        const article = await tx.knowledgeArticle.update({
          data: { latestVersionNumber: { increment: 1 } },
          where: { id: articleId },
        });
        const created = await tx.knowledgeArticleVersion.create({
          data: { ...data, articleId, number: article.latestVersionNumber },
        });
        await tx.knowledgeArticleEvent.create({
          data: { actorId: user.id, articleId, type: "SUBMITTED", versionId: created.id },
        });
        return created;
      });
      return this.submissionDto(version.id);
    }

    const slug = await uniqueKnowledgeSlug(this.prisma, slugifyKnowledgeTitle(content.title));
    const version = await this.prisma.$transaction(async (tx) => {
      const article = await tx.knowledgeArticle.create({
        // Audience stays empty: an admin decides who it is for when publishing.
        data: { audience: [], createdById: user.id, latestVersionNumber: 1, slug, status: "DRAFT" },
      });
      const created = await tx.knowledgeArticleVersion.create({ data: { ...data, articleId: article.id, number: 1 } });
      await tx.knowledgeArticleEvent.createMany({
        data: [
          { actorId: user.id, articleId: article.id, type: "CREATED" },
          { actorId: user.id, articleId: article.id, type: "SUBMITTED", versionId: created.id },
        ],
      });
      return created;
    });
    return this.submissionDto(version.id);
  }

  async updateSuggestion(
    accessToken: string | undefined,
    versionId: string,
    content: KnowledgeContentInput,
  ): Promise<KnowledgeSubmissionDto> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCoach(user);
    const { count } = await this.prisma.knowledgeArticleVersion.updateMany({
      data: {
        body: content.body,
        changeNote: content.changeNote,
        pgn: content.pgn,
        resourceRef: content.resourceRef,
        resourceType: content.resourceType,
        summary: content.summary,
        title: content.title,
        warnings: detectKnowledgeWarnings(content),
      },
      // Claim: still the coach's own, still waiting (an admin may have just reviewed it).
      where: { authorId: user.id, id: versionId, status: "SUBMITTED" },
    });
    if (!count) throw new NotFoundException("That suggestion can no longer be edited.");
    return this.submissionDto(versionId);
  }

  async withdrawSuggestion(accessToken: string | undefined, versionId: string): Promise<{ ok: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCoach(user);
    await this.prisma.$transaction(async (tx) => {
      const version = await tx.knowledgeArticleVersion.findFirst({
        select: { articleId: true, id: true },
        where: { authorId: user.id, id: versionId, status: "SUBMITTED" },
      });
      if (!version) throw new NotFoundException("That suggestion can no longer be withdrawn.");
      const others = await tx.knowledgeArticleVersion.count({
        where: { articleId: version.articleId, id: { not: version.id } },
      });
      // A suggested new article with nothing else in it goes with its only version.
      if (others === 0) await tx.knowledgeArticle.delete({ where: { id: version.articleId } });
      else await tx.knowledgeArticleVersion.delete({ where: { id: version.id } });
    });
    return { ok: true };
  }

  // ── Coach topic trends ────────────────────────────────────────────────────

  /**
   * What students in the coach's batches searched for in the help centre over
   * the last 30 days. Logs carry no user id, and a query shows only once
   * KNOWLEDGE_TREND_MIN_COUNT searches made it, so no single student stands out.
   */
  async coachTrends(accessToken: string | undefined): Promise<KnowledgeCoachTrendsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCoach(user);
    const links = await this.prisma.batchCoach.findMany({
      select: { batch: { select: { _count: { select: { students: { where: { isDeleted: false } } } }, id: true, name: true } } },
      where: { coachId: user.id },
    });
    const batches = links.map((l) => l.batch);
    // Too few students and a repeated query could only be one of them (the log has no user id).
    const largeEnough = new Set(
      batches.filter((b) => b._count.students >= KNOWLEDGE_TREND_MIN_BATCH_SIZE).map((b) => b.id),
    );
    const base = {
      days: KNOWLEDGE_TREND_DAYS,
      minBatchSize: KNOWLEDGE_TREND_MIN_BATCH_SIZE,
      minCount: KNOWLEDGE_TREND_MIN_COUNT,
    };
    if (!batches.length) return { ...base, batches: [] };
    const since = new Date(Date.now() - KNOWLEDGE_TREND_DAYS * DAY_MS);
    const logs = await this.prisma.knowledgeSearchLog.findMany({
      select: { batchIds: true, query: true },
      take: 20_000,
      where: { batchIds: { hasSome: batches.map((b) => b.id) }, createdAt: { gte: since }, role: "STUDENT" },
    });
    return {
      ...base,
      batches: batches
        .map((batch) => {
          if (!largeEnough.has(batch.id)) return { id: batch.id, name: batch.name, queries: [] };
          const counts = new Map<string, number>();
          for (const log of logs) {
            if (log.batchIds.includes(batch.id)) counts.set(log.query, (counts.get(log.query) ?? 0) + 1);
          }
          const queries = [...counts.entries()]
            .filter(([, count]) => count >= KNOWLEDGE_TREND_MIN_COUNT)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 15)
            .map(([query, count]) => ({ count, query }));
          return { id: batch.id, name: batch.name, queries };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Full-text rank over the published versions of `ids` (already filtered by
   * `readerWhere`, so nothing here can widen visibility). Title outweighs the
   * summary, which outweighs the body; a plain substring match on the title
   * or body catches what the English stemmer misses (names, ECO codes, Tamil).
   * Small corpus: computed per query, no index (docs/KNOWLEDGE_BASE.md §4).
   */
  private async rank(ids: string[], q: string): Promise<string[]> {
    if (!ids.length) return [];
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH doc AS (
        SELECT a."id",
               v."title",
               v."body",
               setweight(to_tsvector('english', v."title"), 'A') ||
               setweight(to_tsvector('english', coalesce(v."summary", '')), 'B') ||
               setweight(to_tsvector('english', v."body" || ' ' || coalesce(v."pgn", '')), 'C') AS tsv
          FROM "knowledge_articles" a
          JOIN "knowledge_article_versions" v ON v."id" = a."publishedVersionId"
         WHERE a."id" = ANY(${ids}::text[])
      )
      SELECT doc."id"
        FROM doc, websearch_to_tsquery('english', ${q}) query
       WHERE doc.tsv @@ query OR doc."title" ILIKE ${like} OR doc."body" ILIKE ${like}
       ORDER BY (ts_rank(doc.tsv, query) + CASE WHEN doc."title" ILIKE ${like} THEN 1 ELSE 0 END) DESC, doc."id"
       LIMIT 100`;
    return rows.map((r) => r.id);
  }

  private async publishedBodies(rows: SummaryRow[]): Promise<Map<string, string>> {
    const ids = rows.map((r) => r.publishedVersionId).filter((id): id is string => !!id);
    if (!ids.length) return new Map();
    const versions = await this.prisma.knowledgeArticleVersion.findMany({
      select: { articleId: true, body: true },
      where: { id: { in: ids } },
    });
    return new Map(versions.map((v) => [v.articleId, v.body]));
  }

  private toSummary(row: SummaryRow, forThisPage: boolean, q: string | null, body?: string): KnowledgeHelpArticleSummary {
    return {
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      forThisPage,
      id: row.id,
      kind: row.kind,
      language: row.language,
      slug: row.slug,
      snippet: q && body !== undefined ? snippetFor(body, q) : null,
      summary: row.publishedVersion?.summary ?? null,
      title: row.publishedVersion?.title ?? row.slug,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async submissionDto(versionId: string): Promise<KnowledgeSubmissionDto> {
    const v = await this.prisma.knowledgeArticleVersion.findUniqueOrThrow({
      include: {
        ...versionInclude,
        article: { select: { id: true, kind: true, publishedVersion: { select: { title: true } }, slug: true } },
      },
      where: { id: versionId },
    });
    return {
      articleId: v.article.id,
      articleKind: v.article.kind,
      articleSlug: v.article.slug,
      articleTitle: v.article.publishedVersion?.title ?? null,
      isNewArticle: v.number === 1,
      version: toVersionDto(v),
    };
  }

  private assertCoach(user: KnowledgeActor) {
    if (user.role !== UserRole.COACH) throw new ForbiddenException("Only coaches can suggest help articles.");
  }

  private async getAuthenticatedUser(accessToken: string | undefined): Promise<KnowledgeActor> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    return { id: user.id, role: user.role };
  }
}

/** `base`, or `base-2`, `base-3`… — slugs are unique across every article. */
export async function uniqueKnowledgeSlug(prisma: Pick<PrismaTransactionClient, "knowledgeArticle">, base: string): Promise<string> {
  const taken = new Set(
    (
      await prisma.knowledgeArticle.findMany({
        select: { slug: true },
        where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
      })
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Plain text around the first query word found in the body, markdown stripped. */
export function snippetFor(body: string, q: string): string | null {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()!|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return text.length > SNIPPET_RADIUS * 2 ? `${text.slice(0, SNIPPET_RADIUS * 2)}…` : text;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export function assertBadRequest(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BadRequestException(message);
}
