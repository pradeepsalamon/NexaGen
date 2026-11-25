import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  CLASS_RECAP_DISCOVERY_WINDOW_HOURS,
  CLASS_RECAP_MAX_ATTEMPTS,
  CLASS_RECAP_MIN_CLASS_MINUTES,
  CLASS_RECAP_MIN_WORDS,
  CLASS_RECAP_PROMPT_VERSION,
  CLASS_RECAP_START_DELAY_MS,
  countWords,
  pseudonymiseTranscript,
  usableRecapProvider,
  type ClassRecapFailure,
  type RecapPerson
} from "@nexa-chess/types";
import { ClassRecapStatus, LiveSessionStatus, Prisma } from "@prisma/client";
import { RECAP_MODELS, type ChatModelConfig, type RecapModels } from "../ai/chat-model";
import { EntitlementService } from "../platform/entitlement.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { generateRecap, RecapDeferredError, RecapGenerationError } from "./class-recap.generator";
import { ClassRecapService } from "./class-recap.service";

const LOCK_TTL_MS = 10 * 60_000;
/** A local run stopped by a live class waits this long before trying again. */
export const RECAP_DEFER_MS = 15 * 60_000;
/** A failed run is retried after this long (up to `CLASS_RECAP_MAX_ATTEMPTS`). */
export const RECAP_RETRY_MS = 10 * 60_000;
/** While a local model call runs, a class starting anywhere is checked this often. */
const LIVE_CHECK_INTERVAL_MS = 30_000;
/** Recaps made per academy per run (the next run, 5 minutes later, carries on). */
const RECAPS_PER_RUN = 10;

export type RecapRunResult = { queued: number; ready: number; failed: number; skipped: number; deferred: boolean };

/**
 * Makes the AI class recaps (docs/CLASS_RECAPS.md). Every 5 minutes, one
 * runner (`JobLockService`), once per academy inside its context:
 *
 *  1. picks up ended classes of the last 48 h that have a transcript and no
 *     recap yet (a row per class, QUEUED);
 *  2. writes the waiting drafts with the academy's chosen model. The local
 *     model shares the box's CPU with every live class, so it never starts
 *     while any class (any academy) is live, and a call in progress is
 *     stopped when one starts (the recap waits 15 minutes).
 *
 * Off unless `AI_CLASS_RECAPS_ENABLED`; each academy also needs the plan
 * feature and its own switch. The row is the truth: a crashed run leaves
 * RUNNING rows that the next run puts back in the queue.
 */
@Injectable()
export class ClassRecapJob {
  private readonly logger = new Logger(ClassRecapJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly entitlements: EntitlementService,
    private readonly recaps: ClassRecapService,
    @Inject(RECAP_MODELS) private readonly models: RecapModels
  ) {}

  @Cron("*/5 * * * *", { name: "class-recaps" })
  async tick(): Promise<void> {
    if (!getApiEnv().AI_CLASS_RECAPS_ENABLED) return;
    await this.jobLocks
      .runForEachTenant(
        JOB_LOCKS.classRecaps,
        async (signal, tenantId) => {
          const result = await this.runForAcademy(signal);
          if (result.queued || result.ready || result.failed || result.skipped || result.deferred) {
            this.logger.log(
              `${tenantId}: queued ${result.queued}, ready ${result.ready}, failed ${result.failed}, skipped ${result.skipped}` +
                (result.deferred ? " (paused: a class is live)" : "")
            );
          }
        },
        { ttlMs: LOCK_TTL_MS }
      )
      .catch((error: unknown) => this.logger.error(`Class recap run failed: ${(error as Error).message}`));
  }

  /** One academy's run. Inside `runInTenant`. */
  async runForAcademy(signal: AbortSignal, now: () => Date = () => new Date()): Promise<RecapRunResult> {
    const result: RecapRunResult = { deferred: false, failed: 0, queued: 0, ready: 0, skipped: 0 };
    if (!(await this.entitlements.hasFeature("aiClassRecaps"))) return result;
    const settings = await this.recaps.academySettings();
    if (!settings.enabled) return result;

    // One runner holds the lock, so a RUNNING row here was left by a run that died.
    await this.prisma.classRecap.updateMany({ data: { status: ClassRecapStatus.QUEUED }, where: { status: ClassRecapStatus.RUNNING } });
    result.queued = await this.discover(now());

    const provider = usableRecapProvider(settings.provider, { local: this.models.local !== null, outside: this.models.outside !== null });
    const config = provider === "LOCAL" ? this.models.local : provider === "OUTSIDE" ? this.models.outside : null;
    if (!config) return result;

    for (let i = 0; i < RECAPS_PER_RUN && !signal.aborted; i += 1) {
      if (config.provider === "LOCAL" && (await this.anyClassLive())) {
        result.deferred = true;
        break;
      }
      const row = await this.prisma.classRecap.findFirst({
        orderBy: [{ notBefore: "asc" }, { id: "asc" }],
        select: { id: true },
        where: { notBefore: { lte: now() }, status: ClassRecapStatus.QUEUED }
      });
      if (!row) break;
      const outcome = await this.makeRecap(row.id, config, signal, now);
      if (outcome === "DEFERRED") {
        result.deferred = true;
        break;
      }
      if (outcome === "READY") result.ready += 1;
      else if (outcome === "FAILED") result.failed += 1;
      else if (outcome === "SKIPPED") result.skipped += 1;
    }
    return result;
  }

  /** Ended classes with a transcript and no recap get a QUEUED row. */
  async discover(now: Date): Promise<number> {
    const sessions = await this.prisma.liveSession.findMany({
      select: { classId: true, endedAt: true, startedAt: true },
      take: 200,
      where: {
        class: { classRecap: { is: null }, isDemo: false },
        endedAt: {
          gte: new Date(now.getTime() - CLASS_RECAP_DISCOVERY_WINDOW_HOURS * 3_600_000),
          lte: new Date(now.getTime() - CLASS_RECAP_START_DELAY_MS)
        },
        startedAt: { not: null },
        status: LiveSessionStatus.ENDED,
        transcriptSegments: { some: {} }
      }
    });
    if (sessions.length === 0) return 0;
    const isLongEnough = (s: (typeof sessions)[number]) =>
      !!s.startedAt && !!s.endedAt && s.endedAt.getTime() - s.startedAt.getTime() >= CLASS_RECAP_MIN_CLASS_MINUTES * 60_000;
    const tenantId = requireTenantId("classRecap");
    // A short class gets a SKIPPED row, so staff see why and it isn't looked at again.
    await this.prisma.classRecap.createMany({
      data: sessions.map((s) =>
        isLongEnough(s)
          ? { classId: s.classId, notBefore: now, tenantId }
          : { classId: s.classId, failureCode: "SHORT_CLASS", notBefore: now, status: ClassRecapStatus.SKIPPED, tenantId }
      ),
      skipDuplicates: true
    });
    return sessions.filter(isLongEnough).length;
  }

  /** Claims one QUEUED row and writes its draft. */
  async makeRecap(
    id: string,
    config: ChatModelConfig,
    signal: AbortSignal,
    now: () => Date = () => new Date()
  ): Promise<"READY" | "FAILED" | "SKIPPED" | "DEFERRED" | "LOST"> {
    const claimed = await this.prisma.classRecap.updateMany({
      data: { attempts: { increment: 1 }, status: ClassRecapStatus.RUNNING },
      where: { id, status: ClassRecapStatus.QUEUED }
    });
    if (claimed.count === 0) return "LOST";
    const row = await this.prisma.classRecap.findUniqueOrThrow({ select: { attempts: true, classId: true }, where: { id } });

    const input = await this.loadTranscript(row.classId);
    if (input.lines.length === 0) return this.finish(id, ClassRecapStatus.SKIPPED, "NO_TRANSCRIPT");
    if (countWords(input.lines.join(" ")) < CLASS_RECAP_MIN_WORDS) return this.finish(id, ClassRecapStatus.SKIPPED, "TOO_SHORT");

    const started = Date.now();
    const local = config.provider === "LOCAL";
    try {
      const generated = await this.withLiveClassWatch(local, signal, (callSignal) =>
        generateRecap({
          beforeCall: local
            ? async () => {
                if (await this.anyClassLive()) throw new RecapDeferredError("A class is live.");
              }
            : undefined,
          chunkTokens: getApiEnv().AI_CLASS_RECAP_CHUNK_TOKENS,
          complete: async (prompt, maxTokens) => {
            try {
              return await this.models.complete(config, prompt, { maxTokens, signal: callSignal });
            } catch (error) {
              // Stopped because a class started, or the job's lease was lost: try again later.
              if (callSignal.aborted) throw new RecapDeferredError("Stopped.");
              throw error;
            }
          },
          lines: input.lines
        })
      );
      const content = generated.content as unknown as Prisma.InputJsonValue;
      await this.prisma.classRecap.updateMany({
        data: {
          contentJson: content,
          draftJson: content,
          failureCode: null,
          generatedAt: now(),
          latencyMs: Date.now() - started,
          model: config.model,
          modelCalls: generated.calls,
          promptVersion: CLASS_RECAP_PROMPT_VERSION,
          provider: config.provider,
          providerName: config.name,
          removedCount: generated.removed,
          status: ClassRecapStatus.READY
        },
        where: { id, status: ClassRecapStatus.RUNNING }
      });
      return "READY";
    } catch (error) {
      if (error instanceof RecapDeferredError) {
        // Not the recap's fault: the attempt doesn't count.
        await this.prisma.classRecap.updateMany({
          data: { attempts: { decrement: 1 }, notBefore: new Date(now().getTime() + RECAP_DEFER_MS), status: ClassRecapStatus.QUEUED },
          where: { id, status: ClassRecapStatus.RUNNING }
        });
        return "DEFERRED";
      }
      const code: ClassRecapFailure = error instanceof RecapGenerationError ? error.code : "MODEL_ERROR";
      // Only our own code; never the transcript or the model's answer.
      this.logger.warn(`Class recap ${id} failed (${code}), attempt ${row.attempts}`);
      if (row.attempts >= CLASS_RECAP_MAX_ATTEMPTS) return this.finish(id, ClassRecapStatus.FAILED, code);
      await this.prisma.classRecap.updateMany({
        data: { failureCode: code, notBefore: new Date(now().getTime() + RECAP_RETRY_MS), status: ClassRecapStatus.QUEUED },
        where: { id, status: ClassRecapStatus.RUNNING }
      });
      return "FAILED";
    }
  }

  /**
   * The class's transcript, oldest first, with every student's and the
   * coach's name replaced (students S1, S2… in id order).
   */
  async loadTranscript(classId: string): Promise<{ lines: string[] }> {
    const cls = await this.prisma.coachClass.findUnique({
      select: {
        attendances: { select: { student: { select: { firstName: true, id: true, lastName: true, username: true } } } },
        batchId: true,
        coach: { select: { firstName: true, lastName: true, username: true } },
        liveSession: { select: { id: true } }
      },
      where: { id: classId }
    });
    if (!cls?.liveSession) return { lines: [] };
    const segments = await this.prisma.liveClassTranscriptSegment.findMany({
      orderBy: [{ spokenAt: "asc" }, { id: "asc" }],
      select: { text: true },
      where: { liveSessionId: cls.liveSession.id }
    });
    if (segments.length === 0) return { lines: [] };

    // Everyone who was ever in the batch (removed students too), plus anyone who attended.
    const enrolled = cls.batchId
      ? await this.prisma.withDeleted.batchStudent.findMany({
          select: { student: { select: { firstName: true, id: true, lastName: true, username: true } } },
          where: { batchId: cls.batchId }
        })
      : [];
    const students = new Map<string, RecapPerson>();
    for (const { student } of [...enrolled, ...cls.attendances]) if (student) students.set(student.id, student);
    const ordered = [...students.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, person]) => person);

    const text = pseudonymiseTranscript(segments.map((s) => s.text).join("\n"), ordered, cls.coach);
    return { lines: text.split("\n") };
  }

  private async finish(id: string, status: ClassRecapStatus, code: ClassRecapFailure): Promise<"FAILED" | "SKIPPED"> {
    await this.prisma.classRecap.updateMany({ data: { failureCode: code, status }, where: { id, status: ClassRecapStatus.RUNNING } });
    return status === ClassRecapStatus.SKIPPED ? "SKIPPED" : "FAILED";
  }

  /**
   * Runs `fn` with a signal that aborts when the job's lease is lost or, for
   * the local model, when any class goes live (checked every 30 seconds).
   */
  private async withLiveClassWatch<T>(watch: boolean, signal: AbortSignal, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);
    let checking = false;
    const timer = watch
      ? setInterval(() => {
          if (checking) return;
          checking = true;
          this.anyClassLive()
            .then((live) => {
              if (live) controller.abort();
            })
            .catch(() => undefined)
            .finally(() => {
              checking = false;
            });
        }, LIVE_CHECK_INTERVAL_MS)
      : null;
    timer?.unref?.();
    try {
      return await fn(controller.signal);
    } finally {
      if (timer) clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  /** The local model shares the box's CPU with every academy's classes. */
  private async anyClassLive(): Promise<boolean> {
    const live = await asPlatform("class-recaps: the local model pauses while any academy has a live class (shared CPU)", () =>
      this.prisma.liveSession.count({ where: { status: LiveSessionStatus.LIVE } })
    );
    return live > 0;
  }
}
