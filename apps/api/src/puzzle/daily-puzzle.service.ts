import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  addDays,
  computeDailyStreak,
  DAILY_PUZZLE_BANDS,
  DAILY_PUZZLE_LEVELS,
  DAILY_PUZZLE_SCHEDULE_DAYS,
  DEFAULT_DAILY_PUZZLE_WHATSAPP_SETTINGS,
  dailyPuzzleLevelFor,
  INITIAL_PUZZLE_RATING,
  longestDailyStreak,
  puzzleOpponentRating,
  resolveDailyPuzzleSource,
  type DailyPuzzleCard,
  type DailyPuzzleLevel,
  type DailyPuzzleScheduleResponse,
  type DailyPuzzleScheduleSlot,
  type DailyPuzzleSettingsResponse,
  type DailyPuzzleTodayResponse,
  type DailyPuzzleWhatsAppSettings,
  type SetDailyPuzzleOverrideRequest,
  type UpdateDailyPuzzleSettingsRequest,
  type StartDailyPuzzleResponse
} from "@nexa-chess/types";
import {
  DailyPuzzleKind,
  Prisma,
  PuzzleAttemptContext,
  PuzzleSource,
  PuzzleStatus,
  PuzzleVisibility,
  UserRole,
  type User
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateToDay, dayToDate, localDay } from "../progress/progress-recorder.service";
import { requireTenantId, singletonRowId } from "../tenancy/tenant-sql";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";
import { PuzzleCatalogService } from "./puzzle-catalog.service";
import { assertStudent, authenticateUser, isAdminRole } from "./puzzle-auth.helper";

// ──────────────────────────────────────────────────────────────
// Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md). This service picks and
// resolves the day's puzzles and opens a DAILY attempt; solving runs on the
// ordinary attempt routes, and PuzzleAttemptService.submit calls
// `recordFinish`. Days are calendar days in the academy's time zone.
// ──────────────────────────────────────────────────────────────

const ACADEMY_SCOPE = "academy";
const batchScope = (batchId: string) => `batch:${batchId}`;
/** Catalogue walk: rows per query, queries per band. */
const WALK_BATCH = 30;
const WALK_BATCHES = 4;
const STATEMENT_TIMEOUT = "3s";

type PuzzleSummary = { id: string; title: string; rating: number | null };
type WalkRow = { id: string; randKey: number; contentHash: string };
type Layers = { academy: string | null; auto: string | null; batch: string | null };

/** Deterministic per academy, day and level: everyone's pick starts from the same place. */
export function dailyPickKey(tenantId: string, day: string, level: DailyPuzzleLevel): number {
  return parseInt(createHash("sha1").update(`${tenantId}:${day}:${level}`).digest("hex").slice(0, 8), 16) >>> 1;
}

@Injectable()
export class DailyPuzzleService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly catalog: PuzzleCatalogService,
    // The two files import each other (the WhatsApp service reads this one lazily).
    @Inject(forwardRef(() => DailyPuzzleWhatsAppService))
    private readonly whatsapp: DailyPuzzleWhatsAppService
  ) {}

  // ── Student ──

  async today(accessToken: string | undefined): Promise<DailyPuzzleTodayResponse> {
    const student = await this.getStudent(accessToken);
    const day = await this.academyToday();
    const [homeBatchId, enabled, progress, entries] = await Promise.all([
      this.homeBatchId(student.id),
      this.academyEnabled(),
      this.prisma.studentProgress.findUnique({ select: { puzzleRating: true }, where: { studentId: student.id } }),
      this.prisma.dailyPuzzleEntry.findMany({
        include: { attempt: { select: { status: true } } },
        where: { studentId: student.id }
      })
    ]);
    const finishedDays = entries.filter((e) => e.finishedAt).map((e) => dateToDay(e.day)!);
    const todays = entries.filter((e) => dateToDay(e.day) === day);
    const on = enabled && homeBatchId !== null;

    const puzzles: DailyPuzzleCard[] = [];
    if (on) {
      for (const level of DAILY_PUZZLE_LEVELS) {
        const entry = todays.find((e) => e.level === level);
        // Started today: keep that puzzle even if an override changed since.
        const puzzleId = entry?.puzzleId ?? (await this.resolveToday(day, level, homeBatchId, student.id));
        if (!puzzleId) continue;
        const summary = (await this.summaries([puzzleId])).get(puzzleId);
        if (!summary) continue;
        puzzles.push({
          level,
          puzzleId,
          rating: summary.rating,
          result: !entry ? null : entry.finishedAt ? (entry.solved ? "SOLVED" : "FAILED") : "IN_PROGRESS",
          title: summary.title
        });
      }
    }

    return {
      bestStreak: longestDailyStreak(finishedDays),
      day,
      doneToday: todays.some((e) => e.finishedAt),
      enabled: on,
      myLevel: dailyPuzzleLevelFor(progress?.puzzleRating ?? INITIAL_PUZZLE_RATING),
      puzzles,
      streak: computeDailyStreak(finishedDays, day),
      whatsapp: await this.whatsapp.statusFor(student)
    };
  }

  /** Opens (or resumes) today's DAILY attempt at a level. */
  async start(accessToken: string | undefined, level: DailyPuzzleLevel): Promise<StartDailyPuzzleResponse & { finished: boolean }> {
    const student = await this.getStudent(accessToken);
    const homeBatchId = await this.homeBatchId(student.id);
    if (!(await this.academyEnabled()) || homeBatchId === null) {
      throw new ForbiddenException("Puzzle of the Day isn't on for your batch.");
    }
    const day = await this.academyToday();
    const existing = await this.prisma.dailyPuzzleEntry.findUnique({
      where: { studentId_day_level: { day: dayToDate(day), level, studentId: student.id } }
    });
    if (existing) {
      return { attemptId: existing.attemptId, finished: existing.finishedAt !== null, puzzleId: existing.puzzleId };
    }

    const puzzleId = await this.resolveToday(day, level, homeBatchId, student.id);
    if (!puzzleId) throw new NotFoundException("There is no puzzle at this level today.");

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const count = await tx.puzzleAttempt.count({ where: { puzzleId, studentId: student.id } });
        const attempt = await tx.puzzleAttempt.create({
          data: { attemptNumber: count + 1, context: PuzzleAttemptContext.DAILY, puzzleId, studentId: student.id }
        });
        return tx.dailyPuzzleEntry.create({
          data: { attemptId: attempt.id, day: dayToDate(day), level, puzzleId, studentId: student.id }
        });
      });
      return { attemptId: entry.attemptId, finished: false, puzzleId };
    } catch (error) {
      // A double click: the other request opened it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.prisma.dailyPuzzleEntry.findUnique({
          where: { studentId_day_level: { day: dayToDate(day), level, studentId: student.id } }
        });
        if (winner) return { attemptId: winner.attemptId, finished: winner.finishedAt !== null, puzzleId: winner.puzzleId };
        throw new ConflictException("Please try again.");
      }
      throw error;
    }
  }

  /** Called by PuzzleAttemptService.submit when a DAILY attempt finishes. Idempotent. */
  async recordFinish(attemptId: string, solved: boolean): Promise<void> {
    await this.prisma.dailyPuzzleEntry.updateMany({
      data: { finishedAt: new Date(), solved },
      where: { attemptId, finishedAt: null }
    });
  }

  // ── Admin / coach ──

  async schedule(
    accessToken: string | undefined,
    query: { batchId?: string; from?: string }
  ): Promise<DailyPuzzleScheduleResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const batch = await this.managedScope(user, query.batchId);
    const today = await this.academyToday();
    const from = query.from && query.from > today ? query.from : today;
    const days = Array.from({ length: DAILY_PUZZLE_SCHEDULE_DAYS }, (_, i) => addDays(from, i));

    const rows = await this.prisma.dailyPuzzle.findMany({
      where: {
        day: { gte: dayToDate(days[0]), lte: dayToDate(days[days.length - 1]) },
        scopeKey: { in: batch ? [ACADEMY_SCOPE, batchScope(batch.id)] : [ACADEMY_SCOPE] }
      }
    });
    const summaries = await this.summaries([...new Set(rows.map((r) => r.puzzleId))]);
    const find = (day: string, level: DailyPuzzleLevel, scopeKey: string, kind: DailyPuzzleKind) => {
      const row = rows.find(
        (r) => dateToDay(r.day) === day && r.level === level && r.scopeKey === scopeKey && r.kind === kind
      );
      return row && summaries.has(row.puzzleId) ? row.puzzleId : null;
    };

    const slots: DailyPuzzleScheduleSlot[] = days.flatMap((day) =>
      DAILY_PUZZLE_LEVELS.map((level) => {
        const layers: Layers = {
          academy: find(day, level, ACADEMY_SCOPE, DailyPuzzleKind.OVERRIDE),
          auto: find(day, level, ACADEMY_SCOPE, DailyPuzzleKind.AUTO),
          batch: batch ? find(day, level, batchScope(batch.id), DailyPuzzleKind.OVERRIDE) : null
        };
        const resolved = resolveDailyPuzzleSource(layers);
        return {
          day,
          level,
          overridden: batch ? layers.batch !== null : layers.academy !== null,
          puzzle: resolved ? summaries.get(resolved.value)! : null,
          source: resolved?.source ?? null
        };
      })
    );

    return {
      academyEnabled: await this.academyEnabled(),
      batchEnabled: batch ? batch.dailyPuzzleEnabled : null,
      batchId: batch?.id ?? null,
      slots,
      today,
      // How many numbers the WhatsApp send reaches: the academy's figure, for admins.
      whatsapp: batch === null ? await this.whatsapp.summary() : null
    };
  }

  async setOverride(accessToken: string | undefined, dto: SetDailyPuzzleOverrideRequest): Promise<DailyPuzzleScheduleSlot> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const batch = await this.managedScope(user, dto.batchId);
    if (dto.day < (await this.academyToday())) {
      throw new BadRequestException("A day that has passed can't be changed.");
    }
    const scopeKey = batch ? batchScope(batch.id) : ACADEMY_SCOPE;
    const key = { day: dayToDate(dto.day), kind: DailyPuzzleKind.OVERRIDE, level: dto.level, scopeKey };

    if (dto.puzzleId === null) {
      await this.prisma.dailyPuzzle.deleteMany({ where: key });
    } else {
      await this.assertOverridePuzzle(dto.puzzleId, batch?.id ?? null);
      const existing = await this.prisma.dailyPuzzle.findFirst({ select: { id: true }, where: key });
      if (existing) {
        await this.prisma.dailyPuzzle.update({ data: { puzzleId: dto.puzzleId, setById: user.id }, where: { id: existing.id } });
      } else {
        await this.prisma.dailyPuzzle.create({
          data: { ...key, batchId: batch?.id ?? null, puzzleId: dto.puzzleId, setById: user.id }
        });
      }
    }

    const schedule = await this.schedule(accessToken, { batchId: batch?.id, from: dto.day });
    return schedule.slots.find((s) => s.day === dto.day && s.level === dto.level)!;
  }

  async updateSettings(accessToken: string | undefined, dto: UpdateDailyPuzzleSettingsRequest): Promise<DailyPuzzleSettingsResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException("Only admins can change Puzzle of the Day settings.");
    const tenantId = requireTenantId("dailyPuzzleSettings");
    const data = {
      ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
      ...(dto.whatsapp
        ? {
            whatsappAnswerAfter: dto.whatsapp.answerAfter,
            whatsappHintAfter: dto.whatsapp.hintAfter,
            whatsappLevel: dto.whatsapp.level,
            whatsappMaxTries: dto.whatsapp.maxTries
          }
        : {}),
      updatedById: user.id
    };
    const row = await this.prisma.dailyPuzzleSettings.upsert({
      create: { ...data, id: singletonRowId(tenantId), tenantId },
      update: data,
      where: { tenantId }
    });
    return { enabled: row.enabled, whatsapp: whatsappSettingsOf(row) };
  }

  // ── Step 3 (WhatsApp picture + answering), for DailyPuzzleWhatsAppService ──

  /** The academy's picture level and reply limits (defaults until an admin saves them). */
  async whatsappSettings(): Promise<DailyPuzzleWhatsAppSettings> {
    const row = await this.prisma.dailyPuzzleSettings.findUnique({ where: { tenantId: requireTenantId("dailyPuzzleSettings") } });
    return row ? whatsappSettingsOf(row) : { ...DEFAULT_DAILY_PUZZLE_WHATSAPP_SETTINGS };
  }

  /** The academy-wide puzzle of a day and level (never a batch's), picked now if needed. */
  academyPuzzle(day: string, level: DailyPuzzleLevel, actorId: string): Promise<string | null> {
    return this.resolveToday(day, level, null, actorId);
  }

  /** Today in the academy, and whether Puzzle of the Day is on there. */
  async academyDay(): Promise<{ day: string; enabled: boolean }> {
    const [day, enabled] = await Promise.all([this.academyToday(), this.academyEnabled()]);
    return { day, enabled };
  }

  /** The student's streak as of `today` (the app's own rule). */
  async streakFor(studentId: string, today: string, client: Pick<PrismaService, "dailyPuzzleEntry"> = this.prisma): Promise<number> {
    const rows = await client.dailyPuzzleEntry.findMany({
      select: { day: true },
      where: { finishedAt: { not: null }, studentId }
    });
    return computeDailyStreak(
      rows.map((r) => dateToDay(r.day)!),
      today
    );
  }

  /** The student's first-enrolled batch with the daily puzzle on; null = it is off for them. */
  studentHomeBatch(studentId: string): Promise<string | null> {
    return this.homeBatchId(studentId);
  }

  async updateBatch(accessToken: string | undefined, batchId: string, enabled: boolean): Promise<{ batchId: string; enabled: boolean }> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const batch = (await this.managedScope(user, batchId))!;
    const row = await this.prisma.batch.update({
      data: { dailyPuzzleEnabled: enabled },
      select: { dailyPuzzleEnabled: true, id: true },
      where: { id: batch.id }
    });
    return { batchId: row.id, enabled: row.dailyPuzzleEnabled };
  }

  // ── Internals ──

  private async getStudent(accessToken: string | undefined): Promise<User> {
    return assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  /** `YYYY-MM-DD` today in the academy's time zone. */
  private async academyToday(): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      select: { timezone: true },
      where: { id: requireTenantId("dailyPuzzle") }
    });
    return localDay(tenant?.timezone);
  }

  private async academyEnabled(): Promise<boolean> {
    const row = await this.prisma.dailyPuzzleSettings.findUnique({
      select: { enabled: true },
      where: { tenantId: requireTenantId("dailyPuzzleSettings") }
    });
    return row?.enabled ?? true;
  }

  /** The student's first-enrolled batch with training and the daily puzzle on; null = off for them. */
  private async homeBatchId(studentId: string): Promise<string | null> {
    const row = await this.prisma.batchStudent.findFirst({
      orderBy: { enrolledAt: "asc" },
      select: { batchId: true },
      where: {
        batch: { dailyPuzzleEnabled: true, isDeleted: false, puzzleTrainingEnabled: true },
        isDeleted: false,
        studentId
      }
    });
    return row?.batchId ?? null;
  }

  /**
   * The academy (no batch id, admins only) or one batch (admins: any batch of
   * the academy; coaches: one they are assigned to). Anything else: 403/404.
   */
  private async managedScope(user: User, batchId: string | undefined) {
    const admin = isAdminRole(user.role);
    if (!admin && user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only admins and coaches can manage Puzzle of the Day.");
    }
    if (!batchId) {
      if (!admin) throw new ForbiddenException("Choose one of your batches.");
      return null;
    }
    const batch = await this.prisma.batch.findFirst({
      select: { dailyPuzzleEnabled: true, id: true },
      where: {
        id: batchId,
        isDeleted: false,
        ...(admin ? {} : { coaches: { some: { coachId: user.id, isDeleted: false } } })
      }
    });
    if (!batch) throw new NotFoundException("Batch not found.");
    return batch;
  }

  /**
   * An override must be a published library puzzle with a line, that the
   * students it reaches can open: GLOBAL, or (for a batch) PRIVATE by one of
   * that batch's coaches.
   */
  private async assertOverridePuzzle(puzzleId: string, batchId: string | null): Promise<void> {
    const coachIds = batchId
      ? (await this.prisma.batchCoach.findMany({ select: { coachId: true }, where: { batchId, isDeleted: false } })).map(
          (c) => c.coachId
        )
      : [];
    const puzzle = await this.prisma.puzzle.findFirst({
      select: { solutionMovesJson: true },
      where: {
        id: puzzleId,
        source: { not: PuzzleSource.GAME },
        status: PuzzleStatus.PUBLISHED,
        OR: [
          { visibility: PuzzleVisibility.GLOBAL },
          ...(coachIds.length ? [{ createdById: { in: coachIds }, visibility: PuzzleVisibility.PRIVATE }] : [])
        ]
      }
    });
    if (!puzzle) {
      throw new BadRequestException(
        batchId
          ? "Choose a published puzzle the batch's students can open (an academy puzzle, or one of its coaches')."
          : "Choose a published academy-wide puzzle."
      );
    }
    if (!Array.isArray(puzzle.solutionMovesJson) || puzzle.solutionMovesJson.length === 0) {
      throw new BadRequestException("That puzzle has no solution yet.");
    }
  }

  /** Today's puzzle id for a level: batch override, academy override, automatic (picked now if needed). */
  private async resolveToday(
    day: string,
    level: DailyPuzzleLevel,
    homeBatchId: string | null,
    actorId: string
  ): Promise<string | null> {
    const rows = await this.prisma.dailyPuzzle.findMany({
      where: {
        day: dayToDate(day),
        level,
        scopeKey: { in: homeBatchId ? [ACADEMY_SCOPE, batchScope(homeBatchId)] : [ACADEMY_SCOPE] }
      }
    });
    const usable = await this.summaries(rows.map((r) => r.puzzleId));
    const layer = (scopeKey: string, kind: DailyPuzzleKind) => {
      const row = rows.find((r) => r.scopeKey === scopeKey && r.kind === kind);
      return row && usable.has(row.puzzleId) ? row.puzzleId : null;
    };
    const resolved = resolveDailyPuzzleSource({
      academy: layer(ACADEMY_SCOPE, DailyPuzzleKind.OVERRIDE),
      auto: layer(ACADEMY_SCOPE, DailyPuzzleKind.AUTO),
      batch: homeBatchId ? layer(batchScope(homeBatchId), DailyPuzzleKind.OVERRIDE) : null
    });
    if (resolved) return resolved.value;

    // No usable automatic pick yet (or it was archived): pick one and store it.
    const stale = rows.find((r) => r.scopeKey === ACADEMY_SCOPE && r.kind === DailyPuzzleKind.AUTO);
    const puzzleId = await this.autoPick(day, level, actorId);
    if (!puzzleId) return null;
    const key = { day: dayToDate(day), kind: DailyPuzzleKind.AUTO, level, scopeKey: ACADEMY_SCOPE };
    try {
      if (stale) await this.prisma.dailyPuzzle.update({ data: { puzzleId }, where: { id: stale.id } });
      else await this.prisma.dailyPuzzle.create({ data: { ...key, puzzleId } });
      return puzzleId;
    } catch (error) {
      // Another student's request picked first: everyone gets that one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.prisma.dailyPuzzle.findFirst({ select: { puzzleId: true }, where: key });
        return winner?.puzzleId ?? null;
      }
      throw error;
    }
  }

  /**
   * One puzzle in the level's rating band the academy has never had as a daily
   * puzzle: the Lichess catalogue first (quality gate), else the academy's own
   * published GLOBAL puzzles. Null when neither has one.
   */
  private async autoPick(day: string, level: DailyPuzzleLevel, actorId: string): Promise<string | null> {
    const usedRows = await this.prisma.dailyPuzzle.findMany({
      select: { puzzle: { select: { contentHash: true } }, puzzleId: true }
    });
    const usedIds = new Set(usedRows.map((r) => r.puzzleId));
    const usedHashes = new Set(usedRows.map((r) => r.puzzle.contentHash).filter((h): h is string => !!h));
    const key = dailyPickKey(requireTenantId("dailyPuzzle"), day, level);
    return (
      (await this.pickFromCatalogue(level, key, usedIds, usedHashes, actorId)) ??
      (await this.pickFromLibrary(level, key, usedIds, usedHashes))
    );
  }

  private async pickFromCatalogue(
    level: DailyPuzzleLevel,
    startKey: number,
    usedIds: Set<string>,
    usedHashes: Set<string>,
    actorId: string
  ): Promise<string | null> {
    const [low, high] = DAILY_PUZZLE_BANDS[level];
    const bands = Array.from({ length: (high - low) / 50 }, (_, i) => low / 50 + i);
    // Start in a different band each day, so the level's whole range comes up.
    const ordered = [...bands.slice(startKey % bands.length), ...bands.slice(0, startKey % bands.length)];
    for (const band of ordered) {
      let cursor = { id: "", randKey: startKey };
      for (let batch = 0; batch < WALK_BATCHES; batch += 1) {
        const rows = await this.walk(band, cursor);
        if (rows.length === 0) break;
        for (const row of rows) {
          if (usedHashes.has(row.contentHash)) continue;
          const result = await this.catalog.materialise(row.id, {
            createdBy: null,
            topicId: () => this.catalog.ensureLichessFolder(actorId)
          });
          if (result.outcome !== "CREATED" && result.outcome !== "EXISTING") continue;
          if (result.puzzle.status !== PuzzleStatus.PUBLISHED || usedIds.has(result.puzzle.id)) continue;
          return result.puzzle.id;
        }
        const last = rows[rows.length - 1];
        cursor = { id: last.id, randKey: last.randKey };
      }
    }
    return null;
  }

  private async walk(band: number, cursor: { randKey: number; id: string }): Promise<WalkRow[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Same settings as every catalogue query (docs/PUZZLES.md "Using it").
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        await tx.$executeRawUnsafe(`SET LOCAL plan_cache_mode = force_custom_plan`);
        return tx.$queryRaw<WalkRow[]>`
          SELECT id, "randKey", "contentHash" FROM lichess_puzzles
          WHERE "ratingBand" = ${band}::smallint
            AND ("ratingBand", "randKey", id) > (${band}::smallint, ${cursor.randKey}::int, ${cursor.id}::text)
            AND "passesQualityGate"
          ORDER BY "ratingBand", "randKey", id
          LIMIT ${WALK_BATCH}`;
      });
    } catch {
      // A slow walk is "nothing here": the library still answers.
      return [];
    }
  }

  private async pickFromLibrary(
    level: DailyPuzzleLevel,
    startKey: number,
    usedIds: Set<string>,
    usedHashes: Set<string>
  ): Promise<string | null> {
    const [low, high] = DAILY_PUZZLE_BANDS[level];
    const candidates = await this.prisma.puzzle.findMany({
      orderBy: { id: "asc" },
      select: { contentHash: true, difficulty: true, id: true, rating: true, solutionMovesJson: true },
      take: 1000,
      where: {
        id: { notIn: [...usedIds] },
        source: { not: PuzzleSource.GAME },
        status: PuzzleStatus.PUBLISHED,
        visibility: PuzzleVisibility.GLOBAL
      }
    });
    const usable = candidates.filter((p) => {
      const rating = puzzleOpponentRating(p);
      return (
        rating >= low &&
        rating < high &&
        !(p.contentHash && usedHashes.has(p.contentHash)) &&
        Array.isArray(p.solutionMovesJson) &&
        p.solutionMovesJson.length > 0
      );
    });
    return usable.length ? usable[startKey % usable.length].id : null;
  }

  /** Title and rating of the puzzles that can still be shown (published, not in Trash). */
  private async summaries(ids: string[]): Promise<Map<string, PuzzleSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.puzzle.findMany({
      select: { id: true, rating: true, title: true },
      where: { id: { in: ids }, status: PuzzleStatus.PUBLISHED }
    });
    return new Map(rows.map((r) => [r.id, r]));
  }
}

function whatsappSettingsOf(row: {
  whatsappAnswerAfter: number;
  whatsappHintAfter: number;
  whatsappLevel: DailyPuzzleLevel;
  whatsappMaxTries: number;
}): DailyPuzzleWhatsAppSettings {
  return {
    answerAfter: row.whatsappAnswerAfter,
    hintAfter: row.whatsappHintAfter,
    level: row.whatsappLevel,
    maxTries: row.whatsappMaxTries
  };
}
