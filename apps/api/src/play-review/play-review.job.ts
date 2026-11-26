import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  PLAY_REVIEW_BACKFILL_DAYS,
  PLAY_REVIEW_NIGHTLY_BUDGET_MS,
  PLAY_REVIEW_NIGHTLY_COMMENT_CAP,
  PLAY_REVIEW_NIGHTLY_ITEM_CAP,
  aiConsentCoveredProviders,
  type GameEngineAnalysis,
  type PlayFinding,
  type PlayItem
} from "@nexa-chess/types";
import { AiPlayReviewStatus, LiveSessionStatus, Prisma } from "@prisma/client";
import { routeProviderIds, type ChatAnswer, type ChatModelConfig } from "../ai/chat-model";
import { OUTSIDE_AI_PROVIDER, pseudonymisePlay, type OutsideAiProvider } from "../ai/outside/outside-ai";
import { EntitlementService } from "../platform/entitlement.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { GameAnalysisEngineService } from "../stockfish/game-analysis-engine.service";
import { AnalysisAbortedError, StockfishService } from "../stockfish/stockfish.service";
import { asPlatform } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { AiReviewConsentService } from "./ai-review-consent.service";
import { queryUnreviewed } from "./play-feed.sql";
import { PlayItemLoader, type PlayRef } from "./play-item.loader";
import { buildPlayReview, reviewableSegments } from "./play-review.rules";

/** A FAILED review is retried on later nights up to this many attempts. */
export const MAX_REVIEW_ATTEMPTS = 3;
/** Segments analysed per item (a long Storm run is reviewed on its first ones). */
export const MAX_SEGMENTS_PER_REVIEW = 40;
/** Plies of one segment the engine walks (a very long own game is cut). */
export const MAX_PLIES_PER_SEGMENT = 160;
const LOCK_TTL_MS = 10 * 60_000;

export type AcademyRunResult = {
  reviewed: number;
  failed: number;
  skipped: number;
  commented: number;
  /** Why the review pass stopped early, if it did. */
  stoppedBy: "LIVE_CLASS" | "BUDGET" | "ABORTED" | null;
};

/**
 * The nightly AI play review (docs/AI_PLAY_REVIEW.md §3.3). Off-hours, one
 * runner (`JobLockService`), once per academy inside its context:
 *
 *  1. Engine review, every student: their finished play of the last
 *     `PLAY_REVIEW_BACKFILL_DAYS` with no review yet, newest first, capped
 *     per night; the engine pauses (the pass stops) while any class is live.
 *  2. Outside-AI comments, only for students whose switch is on
 *     (`outsideAiAllowed`), past play included, capped per night.
 *
 * The review row is the truth: a crashed night just leaves items for the next.
 */
@Injectable()
export class PlayReviewJob {
  private readonly logger = new Logger(PlayReviewJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly entitlements: EntitlementService,
    private readonly consent: AiReviewConsentService,
    private readonly loader: PlayItemLoader,
    private readonly engine: GameAnalysisEngineService,
    private readonly stockfish: StockfishService,
    @Inject(OUTSIDE_AI_PROVIDER) private readonly provider: OutsideAiProvider
  ) {}

  // 21:30 UTC = 03:00 in India, when no class runs.
  @Cron("30 21 * * *", { name: "play-review-nightly" })
  async nightly(): Promise<void> {
    if (!getApiEnv().PLAY_REVIEW_JOB_ENABLED) return;
    const started = Date.now();
    await this.jobLocks
      .runForEachTenant(
        JOB_LOCKS.playReviewNightly,
        async (signal, tenantId) => {
          const result = await this.runForAcademy(signal, { deadline: started + PLAY_REVIEW_NIGHTLY_BUDGET_MS });
          this.logger.log(
            `${tenantId}: reviewed ${result.reviewed}, failed ${result.failed}, skipped ${result.skipped}, commented ${result.commented}` +
              (result.stoppedBy ? ` (stopped: ${result.stoppedBy})` : "")
          );
        },
        { ttlMs: LOCK_TTL_MS }
      )
      .catch((error: unknown) => this.logger.error(`Nightly play review failed: ${(error as Error).message}`));
  }

  /** One academy's night. Runs inside `runInTenant`. */
  async runForAcademy(signal: AbortSignal, options: { deadline: number; now?: () => number }): Promise<AcademyRunResult> {
    const now = options.now ?? Date.now;
    const result: AcademyRunResult = { commented: 0, failed: 0, reviewed: 0, skipped: 0, stoppedBy: null };
    if (!(await this.entitlements.hasFeature("aiPlayReview"))) return result;
    const switches = await this.consent.academySwitches();

    if (switches.engineReviewEnabled && this.stockfish.isAvailable()) {
      const since = new Date(now() - PLAY_REVIEW_BACKFILL_DAYS * 86_400_000);
      const rows = await queryUnreviewed(this.prisma, { since }, MAX_REVIEW_ATTEMPTS, PLAY_REVIEW_NIGHTLY_ITEM_CAP);
      for (const row of rows) {
        if (signal.aborted) {
          result.stoppedBy = "ABORTED";
          break;
        }
        if (now() >= options.deadline) {
          result.stoppedBy = "BUDGET";
          break;
        }
        if (await this.anyClassLive()) {
          result.stoppedBy = "LIVE_CLASS";
          break;
        }
        const outcome = await this.reviewOne(
          { playedAt: row.played_at, source: row.source, sourceId: row.source_id, studentId: row.student_id },
          signal,
          { refresh: row.refresh }
        );
        if (outcome === "ABORTED") {
          result.stoppedBy = "ABORTED";
          break;
        }
        result[outcome === "DONE" ? "reviewed" : outcome === "FAILED" ? "failed" : "skipped"] += 1;
      }
    }

    if (switches.outsideAiEnabled && this.provider.route().length > 0 && !result.stoppedBy) {
      result.commented = await this.commentPass(signal, options.deadline, now);
    }
    return result;
  }

  /**
   * Review one item and store the row (DONE / SKIPPED / FAILED). `refresh`:
   * a DONE review from before chance counts were stored is reviewed again;
   * if that can't be done the old review stays and is marked `tacticsJson: {}`
   * so it isn't tried every night.
   */
  async reviewOne(
    ref: PlayRef,
    signal: AbortSignal,
    options: { refresh?: boolean } = {}
  ): Promise<"DONE" | "SKIPPED" | "FAILED" | "ABORTED"> {
    const [item] = await this.loader.load([ref]);
    const segments = item ? reviewableSegments(item).slice(0, MAX_SEGMENTS_PER_REVIEW) : [];
    if (!item || segments.length === 0) {
      if (options.refresh) await this.markRefreshed(ref);
      else await this.store(ref, { status: AiPlayReviewStatus.SKIPPED });
      return "SKIPPED";
    }
    try {
      const analysed: { segment: number; engine: GameEngineAnalysis }[] = [];
      for (const index of segments) {
        const segment = item.segments[index];
        const movesUci = segment.moves.slice(0, MAX_PLIES_PER_SEGMENT).map((m) => m.uci);
        analysed.push({ engine: await this.engine.analyzeGame({ movesUci, startFen: segment.startFen }, { config: "QUICK", signal }), segment: index });
      }
      const built = buildPlayReview(item, analysed, this.stockfish.engineName() ?? "stockfish");
      await this.store(ref, {
        accuracy: built.accuracy,
        blunders: built.blunders,
        error: null,
        findingsJson: built.findings as unknown as Prisma.InputJsonValue,
        inaccuracies: built.inaccuracies,
        missedTactics: built.missedTactics,
        mistakes: built.mistakes,
        status: AiPlayReviewStatus.DONE,
        studentMoves: built.studentMoves,
        tacticsJson: built.tactics as unknown as Prisma.InputJsonValue,
        versionsJson: built.versions
      });
      return "DONE";
    } catch (error) {
      if (error instanceof AnalysisAbortedError || signal.aborted) return "ABORTED";
      if (options.refresh) {
        await this.markRefreshed(ref);
        this.logger.warn(`Re-review of ${ref.source} failed: ${(error as Error).message}`);
        return "FAILED";
      }
      // Only our own message; never the item's content.
      await this.store(ref, { error: "The engine couldn't review this.", status: AiPlayReviewStatus.FAILED });
      this.logger.warn(`Review of ${ref.source} failed: ${(error as Error).message}`);
      return "FAILED";
    }
  }

  /**
   * Outside-AI comments on DONE reviews of consenting students that have
   * none yet (past play included), newest first.
   */
  async commentPass(signal: AbortSignal, deadline: number, now: () => number = Date.now): Promise<number> {
    const route = this.provider.route();
    // Each student's consent names the providers it covers; only those are used.
    const covered = await this.consent.coveredProvidersByStudent(routeProviderIds(route));
    const students = [...covered.keys()];
    if (students.length === 0) return 0;
    const reviews = await this.prisma.aiPlayReview.findMany({
      orderBy: { playedAt: "desc" },
      select: { accuracy: true, findingsJson: true, id: true, playedAt: true, source: true, sourceId: true, studentId: true },
      take: PLAY_REVIEW_NIGHTLY_COMMENT_CAP,
      where: { comment: null, status: AiPlayReviewStatus.DONE, studentId: { in: students } }
    });
    let written = 0;
    for (const review of reviews) {
      if (signal.aborted || now() >= deadline) break;
      const [item] = await this.loader.load([
        { playedAt: review.playedAt, source: review.source, sourceId: review.sourceId, studentId: review.studentId }
      ]);
      if (!item) continue;
      const studentRoute = route.filter((c) => c.providerId && covered.get(review.studentId)?.includes(c.providerId));
      if (await this.writeComment(review, item, studentRoute, signal)) written += 1;
    }
    return written;
  }

  private async writeComment(
    review: { id: string; studentId: string; accuracy: number | null; findingsJson: Prisma.JsonValue },
    item: PlayItem,
    route: readonly ChatModelConfig[],
    signal: AbortSignal
  ): Promise<boolean> {
    if (route.length === 0) return false;
    const findings = (Array.isArray(review.findingsJson) ? review.findingsJson : []) as unknown as PlayFinding[];
    let answer: ChatAnswer;
    try {
      answer = await this.provider.comment(route, pseudonymisePlay(item, { accuracy: review.accuracy, findings }), signal);
    } catch (error) {
      this.logger.warn(`Outside AI comment failed: ${(error as Error).message}`);
      return false;
    }
    // The switch may have been turned off while the request ran: re-check in
    // the same transaction as the write, so a withdrawal always wins.
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.aiReviewConsent.findFirst({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { allowed: true, providers: true, version: true },
        where: { studentId: review.studentId }
      });
      const servedBy = answer.servedBy.providerId;
      if (!servedBy || aiConsentCoveredProviders(latest, [servedBy]).length === 0) return false;
      try {
        await tx.aiPlayComment.create({
          data: {
            model: answer.servedBy.model,
            provider: answer.servedBy.name,
            reviewId: review.id,
            studentId: review.studentId,
            text: answer.text
          }
        });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
        throw error;
      }
    });
  }

  private async store(
    ref: PlayRef,
    data: Partial<Omit<Prisma.AiPlayReviewUncheckedCreateInput, "id" | "tenantId" | "studentId" | "source" | "sourceId" | "playedAt">> & {
      status: AiPlayReviewStatus;
    }
  ): Promise<void> {
    const tenantId = requireTenantId("aiPlayReview");
    const reviewedAt = new Date();
    await this.prisma.aiPlayReview.upsert({
      create: { ...data, playedAt: ref.playedAt, reviewedAt, source: ref.source, sourceId: ref.sourceId, studentId: ref.studentId, tenantId },
      update: { ...data, attempts: { increment: 1 }, playedAt: ref.playedAt, reviewedAt },
      where: { tenantId_studentId_source_sourceId: { source: ref.source, sourceId: ref.sourceId, studentId: ref.studentId, tenantId } }
    });
  }

  /** A refresh that couldn't run: keep the old review, never pick it again. */
  private async markRefreshed(ref: PlayRef): Promise<void> {
    await this.prisma.aiPlayReview.updateMany({
      data: { tacticsJson: {} },
      where: {
        source: ref.source,
        sourceId: ref.sourceId,
        status: AiPlayReviewStatus.DONE,
        studentId: ref.studentId,
        tacticsJson: { equals: Prisma.DbNull },
        tenantId: requireTenantId("aiPlayReview")
      }
    });
  }

  /** The engine shares the box's CPU with every academy's classes. */
  private async anyClassLive(): Promise<boolean> {
    const live = await asPlatform("play-review: the nightly engine pauses while any academy has a live class (shared CPU)", () =>
      this.prisma.liveSession.count({ where: { status: LiveSessionStatus.LIVE } })
    );
    return live > 0;
  }
}
