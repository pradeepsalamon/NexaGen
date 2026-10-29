import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  encodePuzzleRushMessage,
  LIVE_CLASS_PUZZLE_RUSH_TOPIC,
  maxComboBonus,
  PUZZLE_RACER_CONFIG,
  PUZZLE_RUSH_GRACE_SECONDS,
  PUZZLE_RUSH_MAX_RATING_DEVIATION,
  PUZZLE_RUSH_RATING_BUCKETS,
  PUZZLE_STORM_CONFIG,
  puzzleRushPlayerMoves,
  rankPuzzleRushStandings,
  type PuzzleRush,
  type PuzzleRushMessage,
  type PuzzleRushPuzzle,
  type PuzzleRushStanding,
  type PuzzleRushStateResponse,
  type ReportPuzzleRushProgressRequest,
  type ReportPuzzleRushProgressResponse,
  type StartPuzzleRushRequest
} from "@nexa-chess/types";
import { Prisma, PuzzleRushMode, UserRole } from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";

const entryInclude = {
  student: { select: { firstName: true, lastName: true, role: true } }
} satisfies Prisma.LiveClassPuzzleRushEntryInclude;

const rushInclude = {
  entries: { include: entryInclude }
} satisfies Prisma.LiveClassPuzzleRushInclude;

type EntryRow = Prisma.LiveClassPuzzleRushEntryGetPayload<{ include: typeof entryInclude }>;
type RushRow = Prisma.LiveClassPuzzleRushGetPayload<{ include: typeof rushInclude }>;
type CatalogueRow = { id: string; fen: string; moves: string; rating: number; randKey: number };

/** Below this many puzzles the catalogue isn't really loaded (a fresh dev box). */
const MIN_RUN_SIZE = 20;
/** §6 catalogue guard, same as the browse routes. */
const STATEMENT_TIMEOUT = "3s";
const GRACE_MS = PUZZLE_RUSH_GRACE_SECONDS * 1000;

/**
 * Puzzle Storm and Puzzle Racer rounds in a live class (the Interactives).
 * The coach starts one; the API freezes a Lichess-style run of catalogue
 * puzzles onto it, and every student plays that run in the browser and
 * reports running totals here. Totals are clamped to what the run and the
 * clock make possible, only ever move forward, and are pushed to the room on
 * `puzzle_rush` so the race track / leaderboard moves live.
 */
@Injectable()
export class LiveClassPuzzleRushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService
  ) {}

  /** Any participant: the class's latest round (an ended one still shows its results). */
  async getCurrent(accessToken: string | undefined, classId: string): Promise<PuzzleRushStateResponse> {
    await this.liveClass.resolveParticipant(accessToken, classId);
    const row = await this.prisma.liveClassPuzzleRush.findFirst({
      where: { liveClassId: classId },
      orderBy: { createdAt: "desc" },
      include: rushInclude
    });
    const now = new Date();
    return { rush: row ? this.toRush(row, now) : null, serverTime: now.toISOString() };
  }

  /** Coach-owner / admin starts a new round (ending any current one). */
  async start(
    accessToken: string | undefined,
    classId: string,
    dto: StartPuzzleRushRequest
  ): Promise<PuzzleRushStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const puzzles = await this.selectRun();
    if (puzzles.length < MIN_RUN_SIZE) {
      throw new ServiceUnavailableException(
        "The Lichess puzzle catalogue isn't loaded on this server, so there are no puzzles to race."
      );
    }

    const now = new Date();
    const racer = dto.mode === "RACER";
    const startsAt = racer ? new Date(now.getTime() + PUZZLE_RACER_CONFIG.countdownSeconds * 1000) : now;
    const endsAt = racer ? new Date(startsAt.getTime() + PUZZLE_RACER_CONFIG.durationSeconds * 1000) : null;

    let created: RushRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await tx.liveClassPuzzleRush.updateMany({
          where: { liveClassId: classId, endedAt: null },
          data: { endedAt: now }
        });
        return tx.liveClassPuzzleRush.create({
          data: {
            endsAt,
            liveClassId: classId,
            mode: racer ? PuzzleRushMode.RACER : PuzzleRushMode.STORM,
            puzzles: puzzles as unknown as Prisma.InputJsonValue,
            startedById: user.id,
            startsAt
          },
          include: rushInclude
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A round was just started in this class.");
      }
      throw error;
    }

    await this.broadcast(liveSession.roomName, { type: "RUSH_CHANGED", rushId: created.id });
    return { rush: this.toRush(created, now), serverTime: now.toISOString() };
  }

  /** Coach-owner / admin ends the current round for everyone. */
  async end(accessToken: string | undefined, classId: string): Promise<PuzzleRushStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const now = new Date();
    const active = await this.prisma.liveClassPuzzleRush.findFirst({
      where: { liveClassId: classId, endedAt: null },
      select: { id: true }
    });
    if (active) {
      // Status-filtered, so a second End (or a racing Start) is a no-op.
      await this.prisma.liveClassPuzzleRush.updateMany({
        where: { id: active.id, endedAt: null },
        data: { endedAt: now }
      });
      await this.broadcast(liveSession.roomName, { type: "RUSH_CHANGED", rushId: active.id });
    }
    return this.getCurrent(accessToken, classId);
  }

  /** A student — or the class's own coach, playing along — reports their running totals. */
  async reportProgress(
    accessToken: string | undefined,
    classId: string,
    dto: ReportPuzzleRushProgressRequest
  ): Promise<ReportPuzzleRushProgressResponse> {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    // Admins dropping in watch; only the class's coach plays alongside the students.
    const ownCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    if (user.role !== UserRole.STUDENT && !ownCoach) {
      throw new ForbiddenException("Only students and the class's coach play Puzzle Storm and Puzzle Racer.");
    }

    const rush = await this.prisma.liveClassPuzzleRush.findFirst({
      where: { id: dto.rushId, liveClassId: classId }
    });
    if (!rush) throw new NotFoundException("That round doesn't exist in this class.");

    const now = new Date();
    const nowMs = now.getTime();
    if (rush.endedAt && nowMs > rush.endedAt.getTime() + GRACE_MS) {
      throw new ConflictException("This round is over.");
    }
    if (rush.mode === PuzzleRushMode.RACER) {
      if (nowMs < rush.startsAt.getTime() - GRACE_MS && (dto.moves > 0 || dto.puzzleIndex > 0)) {
        throw new BadRequestException("The race hasn't started yet.");
      }
      if (rush.endsAt && nowMs > rush.endsAt.getTime() + GRACE_MS) {
        throw new ConflictException("The race is over.");
      }
    }

    let entry = await this.findOrCreateEntry(rush.id, user.id);
    // Already finished, or an older report arriving after a newer one: keep what we have.
    if (entry.finishedAt || dto.moves < entry.moves || dto.puzzleIndex < entry.puzzleIndex) {
      return { standing: this.toStanding(entry, 0) };
    }

    const puzzles = this.puzzlesOf(rush.puzzles);
    const data = this.clamp(rush.mode, puzzles, dto, entry, now);
    const updated = await this.prisma.liveClassPuzzleRushEntry.updateMany({
      where: {
        id: entry.id,
        finishedAt: null,
        moves: { lte: data.moves },
        puzzleIndex: { lte: data.puzzleIndex }
      },
      data
    });
    entry = await this.prisma.liveClassPuzzleRushEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: entryInclude
    });
    const standing = this.toStanding(entry, 0);
    if (updated.count > 0) {
      await this.broadcast(liveSession.roomName, { type: "RUSH_PROGRESS", rushId: rush.id, standing });
    }
    return { standing };
  }

  // ── Run selection ──

  /**
   * Lichess' Storm ladder: for each rating bucket, that many random puzzles
   * from the three 50-point bands around it (a seek into the walk index from a
   * random `randKey`, wrapping round), quality-gated and with a settled
   * rating; then the whole run in rising rating order.
   */
  private async selectRun(): Promise<PuzzleRushPuzzle[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
      // Same reason as the catalogue browse: keep Postgres on custom plans.
      await tx.$executeRawUnsafe(`SET LOCAL plan_cache_mode = force_custom_plan`);
      const picked: CatalogueRow[] = [];
      for (const [rating, count] of PUZZLE_RUSH_RATING_BUCKETS) {
        const centre = Math.floor(rating / 50);
        const candidates: CatalogueRow[] = [];
        for (const band of [centre - 1, centre, centre + 1]) {
          const seed = Math.floor(Math.random() * 2 ** 31);
          const after = await tx.$queryRaw<CatalogueRow[]>`
            SELECT id, fen, moves, rating, "randKey" FROM lichess_puzzles
            WHERE "ratingBand" = ${band}::smallint AND "randKey" >= ${seed}::int
              AND "passesQualityGate" AND "ratingDeviation" <= ${PUZZLE_RUSH_MAX_RATING_DEVIATION}::smallint
            ORDER BY "ratingBand", "randKey", id LIMIT ${count}`;
          candidates.push(...after);
          if (after.length < count) {
            const before = await tx.$queryRaw<CatalogueRow[]>`
              SELECT id, fen, moves, rating, "randKey" FROM lichess_puzzles
              WHERE "ratingBand" = ${band}::smallint AND "randKey" < ${seed}::int
                AND "passesQualityGate" AND "ratingDeviation" <= ${PUZZLE_RUSH_MAX_RATING_DEVIATION}::smallint
              ORDER BY "ratingBand", "randKey", id LIMIT ${count - after.length}`;
            candidates.push(...before);
          }
        }
        picked.push(...shuffle(candidates).slice(0, count));
      }
      return picked;
    });

    const seen = new Set<string>();
    return rows
      .filter((row) => !seen.has(row.id) && seen.add(row.id))
      .map((row) => ({ fen: row.fen, id: row.id, moves: row.moves.split(" ").filter(Boolean), rating: row.rating }))
      .filter((puzzle) => puzzle.moves.length >= 2)
      .sort((a, b) => a.rating - b.rating);
  }

  // ── Progress ──

  private async findOrCreateEntry(rushId: string, studentId: string): Promise<EntryRow> {
    const existing = await this.prisma.liveClassPuzzleRushEntry.findUnique({
      where: { rushId_studentId: { rushId, studentId } },
      include: entryInclude
    });
    if (existing) return existing;
    try {
      return await this.prisma.liveClassPuzzleRushEntry.create({
        data: { rushId, studentId },
        include: entryInclude
      });
    } catch (error) {
      // Two tabs reported at once — the other one created it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.prisma.liveClassPuzzleRushEntry.findUniqueOrThrow({
          where: { rushId_studentId: { rushId, studentId } },
          include: entryInclude
        });
      }
      throw error;
    }
  }

  /**
   * The totals as the run allows them: no more moves than the run holds, no
   * more puzzles finished than it has, a score no higher than those moves
   * could earn, and (Storm) a clock no longer than the start allowance plus
   * every bonus those moves could have won.
   */
  private clamp(
    mode: PuzzleRushMode,
    puzzles: PuzzleRushPuzzle[],
    dto: ReportPuzzleRushProgressRequest,
    entry: EntryRow,
    now: Date
  ) {
    const puzzleIndex = Math.min(dto.puzzleIndex, puzzles.length);
    const reachable = puzzles.slice(0, Math.min(puzzles.length, puzzleIndex + 1));
    const moves = Math.min(
      dto.moves,
      reachable.reduce((sum, p) => sum + puzzleRushPlayerMoves(p), 0)
    );
    const solved = Math.min(dto.solved, puzzleIndex);
    const errors = Math.min(dto.errors, puzzleIndex - solved);
    const bestCombo = Math.min(dto.bestCombo, moves);
    const solvedRatings = puzzles.slice(0, puzzleIndex).map((p) => p.rating);
    const highestRating =
      dto.highestRating === null || solvedRatings.length === 0
        ? null
        : Math.min(dto.highestRating, Math.max(...solvedRatings));

    const playing = moves > 0 || puzzleIndex > 0;
    const startedAt = entry.startedAt ?? (playing ? now : null);
    let finished = dto.finished || (puzzles.length > 0 && puzzleIndex >= puzzles.length);

    let score: number;
    let clockEndsAt: Date | null = null;
    let skipsUsed = 0;
    if (mode === PuzzleRushMode.STORM) {
      score = solved;
      if (startedAt) {
        const allowanceMs =
          (PUZZLE_STORM_CONFIG.initialSeconds + maxComboBonus(PUZZLE_STORM_CONFIG.combo, moves)) * 1000;
        const latest = startedAt.getTime() + allowanceMs + GRACE_MS;
        const reported = dto.clockEndsAt ? Date.parse(dto.clockEndsAt) : latest;
        clockEndsAt = new Date(Math.min(reported, latest));
        // A report after the clock ran out closes the run.
        if (now.getTime() > clockEndsAt.getTime() + GRACE_MS) finished = true;
      }
    } else {
      score = Math.min(dto.score, moves + maxComboBonus(PUZZLE_RACER_CONFIG.combo, moves));
      skipsUsed = Math.min(dto.skipsUsed, PUZZLE_RACER_CONFIG.skips);
    }

    return {
      bestCombo: Math.max(bestCombo, entry.bestCombo),
      clockEndsAt,
      errors: Math.max(errors, entry.errors),
      finishedAt: finished ? now : null,
      highestRating,
      moves,
      puzzleIndex,
      score: Math.max(score, entry.score),
      skipsUsed: Math.max(skipsUsed, entry.skipsUsed),
      solved: Math.max(solved, entry.solved),
      startedAt
    };
  }

  // ── Mapping ──

  private toRush(row: RushRow, now: Date): PuzzleRush {
    const nowMs = now.getTime();
    const ended = !!row.endedAt || (!!row.endsAt && nowMs >= row.endsAt.getTime());
    const status = ended ? "ENDED" : nowMs < row.startsAt.getTime() ? "COUNTDOWN" : "RUNNING";
    const standings = rankPuzzleRushStandings(row.entries.map((e) => this.toStanding(e, 0)));
    return {
      createdAt: row.createdAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      id: row.id,
      mode: row.mode,
      // A Racer countdown hides the run: nobody gets to look ahead.
      puzzles: status === "COUNTDOWN" ? [] : this.puzzlesOf(row.puzzles),
      standings,
      startsAt: row.startsAt.toISOString(),
      status
    };
  }

  private toStanding(entry: EntryRow, rank: number): PuzzleRushStanding {
    return {
      bestCombo: entry.bestCombo,
      clockEndsAt: entry.clockEndsAt?.toISOString() ?? null,
      errors: entry.errors,
      finishedAt: entry.finishedAt?.toISOString() ?? null,
      highestRating: entry.highestRating,
      isCoach: entry.student.role === UserRole.COACH,
      moves: entry.moves,
      name: fullName(entry.student) ?? "Student",
      puzzleIndex: entry.puzzleIndex,
      rank,
      score: entry.score,
      skipsUsed: entry.skipsUsed,
      solved: entry.solved,
      startedAt: entry.startedAt?.toISOString() ?? null,
      studentId: entry.studentId
    };
  }

  private puzzlesOf(json: Prisma.JsonValue): PuzzleRushPuzzle[] {
    return Array.isArray(json) ? (json as unknown as PuzzleRushPuzzle[]) : [];
  }

  private async broadcast(roomName: string, message: PuzzleRushMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(roomName, encodePuzzleRushMessage(message), LIVE_CLASS_PUZZLE_RUSH_TOPIC);
    } catch {
      // Nudge only — REST is authoritative and clients poll while a round runs.
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
