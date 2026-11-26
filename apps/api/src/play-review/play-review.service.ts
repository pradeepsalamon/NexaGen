import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  PLAY_FEED_PAGE_SIZE,
  averageAccuracy,
  PLAY_FINDING_LABELS,
  playFeedQuerySchema,
  playItemKey,
  playSourceSchema,
  type PlayFinding,
  type PlayFeedResponse,
  type PlayItemDetailResponse,
  type PlayItemSummary,
  type PlayReview,
  type PlayReviewRollup,
  type PlayReviewSummary,
  type PlaySource
} from "@nexa-chess/types";
import { UserRole, type AiPlayComment, type AiPlayReview, type User } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { queryFeedPage, type FeedCursor } from "./play-feed.sql";
import { PlayItemLoader, type PlayRef } from "./play-item.loader";

const ROLLUP_DAYS = 7;
const SOURCE_ID = /^[A-Za-z0-9_.-]{1,120}$/;

type ReviewWithComment = AiPlayReview & { comment: AiPlayComment | null };

/**
 * The play feed (every board move a student played, newest first) and the
 * engine review of each item (docs/AI_PLAY_REVIEW.md). The student sees their
 * own; their coach and admins see it through `assertCanViewStudent`.
 */
@Injectable()
export class PlayReviewService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly loader: PlayItemLoader
  ) {}

  async feedMine(accessToken: string | undefined, query: Record<string, unknown>): Promise<PlayFeedResponse> {
    const viewer = await this.authenticate(accessToken);
    this.assertStudent(viewer);
    return this.feed(viewer.id, query);
  }

  async feedFor(accessToken: string | undefined, studentId: string, query: Record<string, unknown>): Promise<PlayFeedResponse> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.feed(studentId, query);
  }

  async itemMine(accessToken: string | undefined, source: string, sourceId: string): Promise<PlayItemDetailResponse> {
    const viewer = await this.authenticate(accessToken);
    this.assertStudent(viewer);
    return this.item(viewer.id, source, sourceId);
  }

  async itemFor(accessToken: string | undefined, studentId: string, source: string, sourceId: string): Promise<PlayItemDetailResponse> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.item(studentId, source, sourceId);
  }

  async rollupMine(accessToken: string | undefined): Promise<PlayReviewRollup> {
    const viewer = await this.authenticate(accessToken);
    this.assertStudent(viewer);
    return this.rollup(viewer.id);
  }

  async rollupFor(accessToken: string | undefined, studentId: string): Promise<PlayReviewRollup> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.rollup(studentId);
  }

  // ── Feed ───────────────────────────────────────────────────

  private async feed(studentId: string, rawQuery: Record<string, unknown>): Promise<PlayFeedResponse> {
    const query = parseOrBadRequest(playFeedQuerySchema, rawQuery);
    const take = query.limit ?? PLAY_FEED_PAGE_SIZE;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const rows = await queryFeedPage(this.prisma, { source: query.source, studentId }, cursor, take + 1);
    const page = rows.slice(0, take);
    const refs: PlayRef[] = page.map((r) => ({ playedAt: r.played_at, source: r.source, sourceId: r.source_id, studentId: r.student_id }));
    const items = await this.loader.load(refs);
    const reviews = await this.reviewsFor(studentId, refs);
    const last = page[page.length - 1];
    return {
      items: items.map(({ segments: _segments, ...summary }): PlayItemSummary => ({
        ...summary,
        review: this.toSummary(reviews.get(summary.key) ?? null)
      })),
      nextCursor: rows.length > take && last ? this.encodeCursor({ key: playItemKey(last.source, last.source_id), playedAt: last.played_at.toISOString() }) : null
    };
  }

  private async item(studentId: string, rawSource: string, sourceId: string): Promise<PlayItemDetailResponse> {
    const source = this.parseSource(rawSource);
    if (!SOURCE_ID.test(sourceId)) throw new NotFoundException("That play item doesn't exist.");
    const ref = await this.loader.resolve(source, sourceId, studentId);
    const [item] = ref ? await this.loader.load([ref]) : [];
    if (!item) throw new NotFoundException("That play item doesn't exist.");
    const review = (await this.reviewsFor(studentId, [{ source, sourceId }])).get(item.key) ?? null;
    return {
      comment: review?.comment
        ? { createdAt: review.comment.createdAt.toISOString(), model: review.comment.model, provider: review.comment.provider, text: review.comment.text }
        : null,
      item: { ...item, review: this.toSummary(review) },
      review: this.toReview(review)
    };
  }

  private async rollup(studentId: string): Promise<PlayReviewRollup> {
    const since = new Date(Date.now() - ROLLUP_DAYS * 86_400_000);
    const rows = await this.prisma.aiPlayReview.findMany({
      select: { accuracy: true, blunders: true, findingsJson: true, source: true },
      where: { playedAt: { gte: since }, status: "DONE", studentId }
    });
    const bySource = new Map<PlaySource, { accuracies: (number | null)[]; blunders: number }>();
    const themes = new Map<string, number>();
    for (const row of rows) {
      const entry = bySource.get(row.source) ?? { accuracies: [], blunders: 0 };
      entry.accuracies.push(row.accuracy);
      entry.blunders += row.blunders;
      bySource.set(row.source, entry);
      for (const finding of this.findingsOf(row.findingsJson)) {
        const label = finding.kind === "MISSED_TACTIC" && finding.motif ? `Missed ${finding.motif.toLowerCase().replace(/_/g, " ")}` : PLAY_FINDING_LABELS[finding.kind];
        themes.set(label, (themes.get(label) ?? 0) + 1);
      }
    }
    return {
      averageAccuracy: averageAccuracy(rows.map((r) => r.accuracy)),
      bySource: [...bySource.entries()]
        .map(([source, e]) => ({ averageAccuracy: averageAccuracy(e.accuracies), blunders: e.blunders, reviewed: e.accuracies.length, source }))
        .sort((a, b) => b.reviewed - a.reviewed),
      reviewed: rows.length,
      since: since.toISOString(),
      themes: [...themes.entries()]
        .map(([label, count]) => ({ count, label }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 6)
    };
  }

  // ── Mappers ────────────────────────────────────────────────

  private async reviewsFor(studentId: string, refs: { source: PlaySource; sourceId: string }[]): Promise<Map<string, ReviewWithComment>> {
    if (refs.length === 0) return new Map();
    const rows = await this.prisma.aiPlayReview.findMany({
      include: { comment: true },
      where: { OR: refs.map((r) => ({ source: r.source, sourceId: r.sourceId })), studentId }
    });
    return new Map(rows.map((r) => [playItemKey(r.source, r.sourceId), r]));
  }

  private toSummary(row: ReviewWithComment | null): PlayReviewSummary | null {
    if (!row) return null;
    return {
      accuracy: row.accuracy,
      blunders: row.blunders,
      hasComment: !!row.comment,
      inaccuracies: row.inaccuracies,
      missedTactics: row.missedTactics,
      mistakes: row.mistakes,
      reviewedAt: row.reviewedAt.toISOString(),
      status: row.status
    };
  }

  private toReview(row: ReviewWithComment | null): PlayReview | null {
    const summary = this.toSummary(row);
    if (!row || !summary) return null;
    const versions = row.versionsJson && typeof row.versionsJson === "object" && !Array.isArray(row.versionsJson) ? row.versionsJson : {};
    return {
      ...summary,
      error: row.error,
      findings: this.findingsOf(row.findingsJson),
      studentMoves: row.studentMoves,
      versions: Object.fromEntries(Object.entries(versions).filter(([, v]) => typeof v === "string")) as Record<string, string>
    };
  }

  private findingsOf(json: unknown): PlayFinding[] {
    return Array.isArray(json) ? (json as PlayFinding[]).filter((f) => !!f && typeof f === "object" && typeof f.kind === "string") : [];
  }

  // ── Helpers ────────────────────────────────────────────────

  private parseSource(raw: string): PlaySource {
    const parsed = playSourceSchema.safeParse(raw);
    if (!parsed.success) throw new NotFoundException("That play item doesn't exist.");
    return parsed.data;
  }

  private encodeCursor(cursor: FeedCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(raw: string): FeedCursor {
    try {
      const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as FeedCursor;
      if (typeof value.key === "string" && typeof value.playedAt === "string" && !Number.isNaN(Date.parse(value.playedAt))) {
        return { key: value.key.slice(0, 200), playedAt: value.playedAt };
      }
    } catch {
      // fall through
    }
    throw new BadRequestException("That page link is no longer valid. Reload the list.");
  }

  private authenticate(accessToken: string | undefined): Promise<User> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertStudent(user: User) {
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have their own play feed.");
  }
}
