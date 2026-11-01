import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  ACTIVITY_SUBMIT_GRACE_SECONDS,
  decidePlayoutOutcome,
  describePlayoutGoal,
  playoutConfigSchema,
  playoutEngineLabel,
  playoutGoalProgress,
  playoutMaxScore,
  PLAYOUT_MAX_PLIES,
  scorePlayout,
  type ActivityRunMessage,
  type PlayoutColor,
  type PlayoutConfig,
  type PlayoutGameResponse,
  type PlayoutGameView,
  type PlayoutMoveRequest,
  type PlayoutMonitorEntry,
  type PlayoutMonitorUpdate,
  type StudentPlayoutState
} from "@nexa-chess/types";
import {
  LiveClassActivityRunStatus,
  PlayoutEndReason,
  PlayoutGameStatus,
  PlayoutResult,
  Prisma,
  UserRole,
  type LiveClassActivityRun,
  type LiveClassPlayoutGame
} from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { ActivityRunEventsService } from "./activity-run-events.service";
import { playoutFacts, playoutPgn, replayPlayout, turnOfPlayout, type StoredPlayoutMove } from "./playout-position";

type GameRow = LiveClassPlayoutGame;
type RunRow = LiveClassActivityRun;
type Finish = { endReason: PlayoutEndReason; result: PlayoutResult; goalAchieved: boolean };

const movesOf = (game: Pick<GameRow, "movesJson">): StoredPlayoutMove[] =>
  Array.isArray(game.movesJson) ? (game.movesJson as unknown as StoredPlayoutMove[]) : [];

const studentMoveCount = (moves: readonly StoredPlayoutMove[]) => moves.filter((m) => m.by === "STUDENT").length;

/**
 * A student's own game against the computer.
 *
 * Independence is in the data, not in a process per student: every game is one
 * row with its own position, history, clock and engine settings, and each engine
 * search is handed exactly that row's position and settings from the shared
 * Stockfish pool (StockfishService, same as Simul) and keeps no state between
 * searches. One student's move can only write their own row: every write is
 * filtered by the game id and the ply the move was played from.
 *
 * There is no coach path into this file's writes. Each public method except the
 * read helpers requires the caller to be the student who owns the game.
 */
@Injectable()
export class PlayoutGameService {
  private readonly logger = new Logger(PlayoutGameService.name);
  /** A retried or duplicate request joins the search already running for that ply. */
  private readonly searching = new Map<string, Promise<GameRow>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveClass: LiveClassService,
    private readonly stockfish: StockfishService,
    private readonly events: ActivityRunEventsService
  ) {}

  // ── Student actions ──

  /** Opens the student's first game, or returns the one they already have (a reload, a second tab). */
  async start(accessToken: string | undefined, classId: string, runId: string): Promise<PlayoutGameResponse> {
    const { run, roomName, studentId } = await this.resolveStudent(accessToken, classId, runId);
    if (run.status !== LiveClassActivityRunStatus.ACTIVE) throw new ConflictException("This activity has ended.");
    const config = this.configOf(run);

    const latest = await this.latestGame(runId, studentId);
    let game = latest ?? (await this.createGame(run, config, studentId, 1));
    game = await this.settleTimer(game, config, roomName);
    return this.respond(run, config, await this.playComputerIfDue(run, config, game, roomName));
  }

  async move(
    accessToken: string | undefined,
    classId: string,
    runId: string,
    gameId: string,
    body: PlayoutMoveRequest
  ): Promise<PlayoutGameResponse> {
    const { run, roomName, game: found } = await this.resolveOwnGame(accessToken, classId, runId, gameId);
    const config = this.configOf(run);

    // A retry after a lost response: the same move at the same ply already landed.
    const played = movesOf(found)[body.ply];
    if (found.ply > body.ply && played?.by === "STUDENT" && played.uci === body.uci) {
      return this.respond(run, config, await this.playComputerIfDue(run, config, found, roomName));
    }

    if (run.status !== LiveClassActivityRunStatus.ACTIVE) throw new ConflictException("This activity has ended.");
    const game = await this.settleTimer(found, config, roomName);
    if (game.status !== PlayoutGameStatus.IN_PROGRESS) {
      // The clock ran out before this move: the student gets the finished game, not an error.
      if (game.endReason === PlayoutEndReason.TIME_UP && found.status === PlayoutGameStatus.IN_PROGRESS) {
        return this.respond(run, config, game);
      }
      throw new ConflictException("This game is over.");
    }
    if (game.ply !== body.ply) throw new ConflictException("The board changed — refresh and try again.");
    if (turnOfPlayout(game.fen, game.studentColor as PlayoutColor) !== "STUDENT") {
      throw new ConflictException("It is the computer's move.");
    }

    const afterStudent = await this.applyMove(run, config, game, body.uci, "STUDENT", roomName);
    if (!afterStudent) throw new ConflictException("The board changed — refresh and try again.");
    return this.respond(run, config, await this.playComputerIfDue(run, config, afterStudent, roomName));
  }

  /** The computer still owes a move (the engine was busy or a reply was lost): try again. */
  async continueGame(accessToken: string | undefined, classId: string, runId: string, gameId: string): Promise<PlayoutGameResponse> {
    const { run, roomName, game: found } = await this.resolveOwnGame(accessToken, classId, runId, gameId);
    const config = this.configOf(run);
    const game = run.status === LiveClassActivityRunStatus.ACTIVE ? await this.settleTimer(found, config, roomName) : found;
    return this.respond(run, config, await this.playComputerIfDue(run, config, game, roomName));
  }

  async hint(accessToken: string | undefined, classId: string, runId: string, gameId: string): Promise<PlayoutGameResponse> {
    const { run, game } = await this.resolveOwnGame(accessToken, classId, runId, gameId);
    if (run.status !== LiveClassActivityRunStatus.ACTIVE) throw new ConflictException("This activity has ended.");
    const config = this.configOf(run);
    if (game.status !== PlayoutGameStatus.IN_PROGRESS) throw new ConflictException("This game is over.");
    if (game.hintsUsed >= config.hints.length) throw new BadRequestException("There are no more hints.");
    const { count } = await this.prisma.liveClassPlayoutGame.updateMany({
      where: { hintsUsed: game.hintsUsed, id: game.id, status: PlayoutGameStatus.IN_PROGRESS },
      data: { hintsUsed: { increment: 1 } }
    });
    const updated = count === 1 ? { ...game, hintsUsed: game.hintsUsed + 1 } : await this.reload(game.id);
    return this.respond(run, config, updated);
  }

  /** Give up: the game ends with the goal not achieved. */
  async resign(accessToken: string | undefined, classId: string, runId: string, gameId: string): Promise<PlayoutGameResponse> {
    const { run, roomName, game } = await this.resolveOwnGame(accessToken, classId, runId, gameId);
    const config = this.configOf(run);
    if (game.status !== PlayoutGameStatus.IN_PROGRESS) return this.respond(run, config, game);
    const finished = await this.finishGame(run, config, game, {
      endReason: PlayoutEndReason.RESIGNED,
      goalAchieved: false,
      result: PlayoutResult.LOSS
    }, roomName);
    return this.respond(run, config, finished ?? (await this.reload(game.id)));
  }

  /** A fresh try from the start position, if any are left. An open game is closed first. */
  async retry(accessToken: string | undefined, classId: string, runId: string, gameId: string): Promise<PlayoutGameResponse> {
    const { run, roomName, game, studentId } = await this.resolveOwnGame(accessToken, classId, runId, gameId);
    if (run.status !== LiveClassActivityRunStatus.ACTIVE) throw new ConflictException("This activity has ended.");
    const config = this.configOf(run);

    // Only the latest game can be retried: a double click finds the new game and returns it.
    const latest = await this.latestGame(runId, studentId);
    if (latest && latest.id !== game.id) return this.respond(run, config, latest);
    // A reached goal is done: a later failed try would hide it from the coach's board.
    if (game.goalAchieved) throw new BadRequestException("You already reached the goal.");
    if (game.attemptNumber >= config.maxAttempts) throw new BadRequestException("You have used all your tries.");

    if (game.status === PlayoutGameStatus.IN_PROGRESS) {
      await this.prisma.liveClassPlayoutGame.updateMany({
        where: { id: game.id, status: PlayoutGameStatus.IN_PROGRESS },
        data: {
          endReason: PlayoutEndReason.RETRIED,
          finishedAt: new Date(),
          result: PlayoutResult.NONE,
          score: 0,
          status: PlayoutGameStatus.ABANDONED
        }
      });
    }
    const fresh = await this.createGame(run, config, studentId, game.attemptNumber + 1);
    this.publish(roomName, run, config, fresh);
    return this.respond(run, config, await this.playComputerIfDue(run, config, fresh, roomName));
  }

  // ── Reads for the other services ──

  /** The student's own view of a Playout run. */
  async studentState(run: RunRow, studentId: string, roomName: string): Promise<StudentPlayoutState> {
    const config = this.configOf(run);
    let game = await this.latestGame(run.id, studentId);
    if (game && run.status === LiveClassActivityRunStatus.ACTIVE) game = await this.settleTimer(game, config, roomName);
    return this.toStudentState(run, config, game);
  }

  /** Coach-owner / admin: the latest try of each student, without move lists. */
  async monitorEntries(run: RunRow, students: { id: string; name: string }[]): Promise<PlayoutMonitorEntry[]> {
    const config = this.configOf(run);
    if (run.status === LiveClassActivityRunStatus.ACTIVE) await this.settleOverdue(run);

    const rows = await this.prisma.liveClassPlayoutGame.findMany({
      where: { runId: run.id },
      include: { student: { select: { firstName: true, id: true, lastName: true } } },
      orderBy: { attemptNumber: "asc" }
    });
    const latest = new Map(rows.map((row) => [row.studentId, row]));
    const names = new Map(students.map((s) => [s.id, s.name]));
    for (const row of rows) {
      if (!names.has(row.studentId)) {
        names.set(row.studentId, `${row.student.firstName} ${row.student.lastName ?? ""}`.trim() || "Student");
      }
    }

    return [...names.entries()]
      .map(([studentId, studentName]): PlayoutMonitorEntry => {
        const game = latest.get(studentId);
        if (!game) {
          return {
            attemptNumber: 0,
            endReason: null,
            endsAt: null,
            fen: null,
            finishedAt: null,
            gameId: null,
            goalAchieved: false,
            lastMoveSan: null,
            lastMoveUci: null,
            ply: 0,
            progress: null,
            result: null,
            score: null,
            startedAt: null,
            status: "PENDING",
            studentId,
            studentMoves: 0,
            studentName,
            turn: null
          };
        }
        const update = this.toUpdate(config, game);
        return {
          ...update,
          status: game.status === PlayoutGameStatus.IN_PROGRESS ? "IN_PROGRESS" : "COMPLETED",
          studentName
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }

  /** One game for the coach's enlarged board. A plain read: it changes nothing. */
  async detailView(run: RunRow, gameId: string): Promise<{ game: PlayoutGameView; studentName: string; computerLabel: string; goalText: string }> {
    const config = this.configOf(run);
    const row = await this.prisma.liveClassPlayoutGame.findFirst({
      where: { id: gameId, runId: run.id },
      include: { student: { select: { firstName: true, lastName: true } } }
    });
    if (!row) throw new NotFoundException("Game not found.");
    return {
      computerLabel: playoutEngineLabel(row.engineSkill),
      game: this.toView(config, row),
      goalText: this.goalText(config),
      studentName: `${row.student.firstName} ${row.student.lastName ?? ""}`.trim() || "Student"
    };
  }

  // ── Internals ──

  private configOf(run: Pick<RunRow, "configJson">): PlayoutConfig {
    return playoutConfigSchema.parse(run.configJson);
  }

  private goalText(config: PlayoutConfig): string {
    return config.goalDescription?.trim() || describePlayoutGoal(config.goal);
  }

  private async resolveStudent(accessToken: string | undefined, classId: string, runId: string) {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students play these games.");
    const run = await this.prisma.liveClassActivityRun.findUnique({ where: { id: runId } });
    if (!run || run.liveClassId !== classId || run.kind !== "PLAYOUT") throw new NotFoundException("Activity not found.");
    return { roomName: liveSession.roomName, run, studentId: user.id };
  }

  /** Another student's game id is a 404: the route never admits it exists. */
  private async resolveOwnGame(accessToken: string | undefined, classId: string, runId: string, gameId: string) {
    const resolved = await this.resolveStudent(accessToken, classId, runId);
    const game = await this.prisma.liveClassPlayoutGame.findUnique({ where: { id: gameId } });
    if (!game || game.runId !== runId || game.studentId !== resolved.studentId) throw new NotFoundException("Game not found.");
    return { ...resolved, game };
  }

  private latestGame(runId: string, studentId: string) {
    return this.prisma.liveClassPlayoutGame.findFirst({ where: { runId, studentId }, orderBy: { attemptNumber: "desc" } });
  }

  private reload(id: string) {
    return this.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id } });
  }

  private async createGame(run: RunRow, config: PlayoutConfig, studentId: string, attemptNumber: number): Promise<GameRow> {
    const now = new Date();
    try {
      return await this.prisma.liveClassPlayoutGame.create({
        data: {
          attemptNumber,
          endsAt: config.timeLimitSeconds ? new Date(now.getTime() + config.timeLimitSeconds * 1000) : null,
          engineMoveMs: config.engine.movetimeMs,
          engineSkill: config.engine.skillLevel,
          fen: config.startFen,
          maxScore: playoutMaxScore(config.scoring),
          pgn: playoutPgn(replayPlayout(config.startFen, []), config.studentColor, playoutEngineLabel(config.engine.skillLevel)),
          runId: run.id,
          startFen: config.startFen,
          startedAt: now,
          studentColor: config.studentColor,
          studentId
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      // A second tab or a double click got there first: use its game.
      const raced = await this.latestGame(run.id, studentId);
      if (!raced) throw error;
      return raced;
    }
  }

  /** Ends this game if its own clock has run out. */
  private async settleTimer(game: GameRow, config: PlayoutConfig, roomName: string): Promise<GameRow> {
    if (game.status !== PlayoutGameStatus.IN_PROGRESS || !game.endsAt) return game;
    if (Date.now() <= game.endsAt.getTime() + ACTIVITY_SUBMIT_GRACE_SECONDS * 1000) return game;
    const run = await this.prisma.liveClassActivityRun.findUniqueOrThrow({ where: { id: game.runId } });
    const finished = await this.finishGame(
      run,
      config,
      game,
      { endReason: PlayoutEndReason.TIME_UP, goalAchieved: false, result: PlayoutResult.NONE },
      roomName
    );
    return finished ?? this.reload(game.id);
  }

  /** The coach's monitor closes games whose clock ran out while their student was away. */
  private async settleOverdue(run: RunRow): Promise<void> {
    await this.prisma.liveClassPlayoutGame.updateMany({
      where: {
        endsAt: { lt: new Date(Date.now() - ACTIVITY_SUBMIT_GRACE_SECONDS * 1000) },
        runId: run.id,
        status: PlayoutGameStatus.IN_PROGRESS
      },
      data: {
        endReason: PlayoutEndReason.TIME_UP,
        finishedAt: new Date(),
        result: PlayoutResult.NONE,
        score: 0,
        status: PlayoutGameStatus.COMPLETED
      }
    });
  }

  /** Validates and writes one move. Null = lost the claim (someone else moved first). */
  private async applyMove(
    run: RunRow,
    config: PlayoutConfig,
    game: GameRow,
    uci: string,
    by: "STUDENT" | "COMPUTER",
    roomName: string
  ): Promise<GameRow | null> {
    const moves = movesOf(game);
    const color = game.studentColor as PlayoutColor;
    const chess = replayPlayout(game.startFen, moves);

    if (by === "STUDENT") {
      const piece = chess.get(uci.slice(0, 2) as never);
      if (piece && config.restrictions.lockedPieces.includes(piece.type as never)) {
        throw new BadRequestException("That piece can't move in this activity.");
      }
    }

    let played;
    try {
      played = chess.move({ from: uci.slice(0, 2), promotion: uci[4], to: uci.slice(2, 4) });
    } catch {
      played = null;
    }
    if (!played) throw new BadRequestException("That move is not legal.");

    const nextMoves: StoredPlayoutMove[] = [
      ...moves,
      { by, ply: game.ply, san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` }
    ];
    const count = studentMoveCount(nextMoves);
    const decided = decidePlayoutOutcome(config.goal, playoutFacts(chess, color, nextMoves));
    let finish: Finish | null = decided
      ? { endReason: decided.endReason as PlayoutEndReason, goalAchieved: decided.goalAchieved, result: decided.result as PlayoutResult }
      : null;
    if (!finish && by === "STUDENT" && config.restrictions.maxStudentMoves && count >= config.restrictions.maxStudentMoves) {
      finish = { endReason: PlayoutEndReason.MOVE_LIMIT, goalAchieved: false, result: PlayoutResult.NONE };
    }
    if (!finish && game.ply + 1 >= PLAYOUT_MAX_PLIES) {
      finish = { endReason: PlayoutEndReason.MOVE_LIMIT, goalAchieved: false, result: PlayoutResult.NONE };
    }

    const now = new Date();
    const fen = chess.fen();
    const pgn = playoutPgn(chess, color, playoutEngineLabel(game.engineSkill));
    const score = finish ? this.scoreOf(config, game, finish, count) : null;
    const data = {
      fen,
      lastMoveAt: now,
      movesJson: nextMoves as unknown as Prisma.InputJsonValue,
      pgn,
      ply: game.ply + 1,
      ...(finish
        ? {
            endReason: finish.endReason,
            finishedAt: now,
            goalAchieved: finish.goalAchieved,
            result: finish.result,
            score,
            status: PlayoutGameStatus.COMPLETED
          }
        : {})
    };
    // The claim: only a write made from the ply this move was played on can land.
    const { count: claimed } = await this.prisma.liveClassPlayoutGame.updateMany({
      where: { id: game.id, ply: game.ply, status: PlayoutGameStatus.IN_PROGRESS },
      data
    });
    if (claimed === 0) return null;

    const after: GameRow = { ...game, ...data, movesJson: nextMoves as unknown as Prisma.JsonValue };
    this.publish(roomName, run, config, after);
    return after;
  }

  private scoreOf(config: PlayoutConfig, game: GameRow, finish: Finish, studentMoves: number): number {
    return scorePlayout(config.scoring, {
      attemptNumber: game.attemptNumber,
      goalAchieved: finish.goalAchieved,
      hintsUsed: game.hintsUsed,
      result: finish.result,
      studentMoves
    });
  }

  /** Non-move endings (time, giving up). Null = the game had already moved on. */
  private async finishGame(run: RunRow, config: PlayoutConfig, game: GameRow, finish: Finish, roomName: string): Promise<GameRow | null> {
    const now = new Date();
    const score = this.scoreOf(config, game, finish, studentMoveCount(movesOf(game)));
    const data = {
      endReason: finish.endReason,
      finishedAt: now,
      goalAchieved: finish.goalAchieved,
      result: finish.result,
      score,
      status: PlayoutGameStatus.COMPLETED
    };
    const { count } = await this.prisma.liveClassPlayoutGame.updateMany({
      where: { id: game.id, status: PlayoutGameStatus.IN_PROGRESS },
      data
    });
    if (count === 0) return null;
    const after: GameRow = { ...game, ...data };
    this.publish(roomName, run, config, after);
    return after;
  }

  /**
   * Plays the computer's reply if it is the computer's turn. An engine failure is
   * not an error for the student: the game simply stays on the computer's move,
   * the response says `engineRetry`, and the client asks again. The computer
   * never makes a random move instead, because a student could then "beat" a
   * defence that was never played.
   */
  private async playComputerIfDue(run: RunRow, config: PlayoutConfig, game: GameRow, roomName: string): Promise<GameRow> {
    if (
      game.status !== PlayoutGameStatus.IN_PROGRESS ||
      run.status !== LiveClassActivityRunStatus.ACTIVE ||
      turnOfPlayout(game.fen, game.studentColor as PlayoutColor) !== "COMPUTER"
    ) {
      return game;
    }
    const key = `${game.id}:${game.ply}`;
    const running = this.searching.get(key);
    if (running) return running;

    const search = (async () => {
      try {
        const best = await this.stockfish.getBestMove(game.fen, {
          movetimeMs: game.engineMoveMs,
          skillLevel: game.engineSkill
        });
        if (!best) {
          this.logger.warn(`The engine found no move in Playout game ${game.id} at ply ${game.ply}.`);
          return game;
        }
        return (await this.applyMove(run, config, game, best.uci, "COMPUTER", roomName)) ?? (await this.reload(game.id));
      } catch (error) {
        this.logger.warn(`Engine reply failed for Playout game ${game.id}: ${(error as Error).message}`);
        return game;
      } finally {
        this.searching.delete(key);
      }
    })();
    this.searching.set(key, search);
    return search;
  }

  private publish(roomName: string, run: RunRow, config: PlayoutConfig, game: GameRow): void {
    const message: ActivityRunMessage = { entry: this.toUpdate(config, game), runId: run.id, type: "PLAYOUT_UPDATE" };
    this.events.toManagers(roomName, message);
  }

  /** The small per-game update the gallery needs: no move list, no PGN. */
  private toUpdate(config: PlayoutConfig, game: GameRow): PlayoutMonitorUpdate {
    const moves = movesOf(game);
    const last = moves[moves.length - 1];
    return {
      attemptNumber: game.attemptNumber,
      endReason: game.endReason,
      endsAt: game.endsAt?.toISOString() ?? null,
      fen: game.fen,
      finishedAt: game.finishedAt?.toISOString() ?? null,
      gameId: game.id,
      goalAchieved: game.goalAchieved,
      lastMoveSan: last?.san ?? null,
      lastMoveUci: last?.uci ?? null,
      ply: game.ply,
      progress: this.progressOf(config, game, moves),
      result: game.result,
      score: game.score,
      startedAt: game.startedAt.toISOString(),
      status: game.status,
      studentId: game.studentId,
      studentMoves: studentMoveCount(moves),
      turn: turnOfPlayout(game.fen, game.studentColor as PlayoutColor)
    };
  }

  private progressOf(config: PlayoutConfig, game: GameRow, moves: StoredPlayoutMove[]): string | null {
    return playoutGoalProgress(config.goal, playoutFacts(replayPlayout(game.startFen, moves), game.studentColor as PlayoutColor, moves));
  }

  private toView(config: PlayoutConfig, game: GameRow): PlayoutGameView {
    const moves = movesOf(game);
    const end = game.finishedAt ?? new Date();
    return {
      attemptNumber: game.attemptNumber,
      durationSeconds: Math.max(0, Math.round((end.getTime() - game.startedAt.getTime()) / 1000)),
      endReason: game.endReason,
      endsAt: game.endsAt?.toISOString() ?? null,
      fen: game.fen,
      finishedAt: game.finishedAt?.toISOString() ?? null,
      goalAchieved: game.goalAchieved,
      hints: config.hints.slice(0, game.hintsUsed),
      hintsUsed: game.hintsUsed,
      id: game.id,
      maxScore: game.maxScore,
      moves,
      pgn: game.pgn,
      ply: game.ply,
      progress: this.progressOf(config, game, moves),
      result: game.result,
      runId: game.runId,
      score: game.score,
      startFen: game.startFen,
      startedAt: game.startedAt.toISOString(),
      status: game.status,
      studentColor: game.studentColor as PlayoutColor,
      studentMoves: studentMoveCount(moves),
      turn: turnOfPlayout(game.fen, game.studentColor as PlayoutColor)
    };
  }

  private toStudentState(run: RunRow, config: PlayoutConfig, game: GameRow | null): StudentPlayoutState {
    const attemptsUsed = game?.attemptNumber ?? 0;
    return {
      attemptsUsed,
      canRetry: run.status === LiveClassActivityRunStatus.ACTIVE && !!game && !game.goalAchieved && attemptsUsed < config.maxAttempts,
      computerLabel: playoutEngineLabel(config.engine.skillLevel),
      game: game ? this.toView(config, game) : null,
      goalText: this.goalText(config),
      hintsAvailable: config.hints.length,
      lockedPieces: config.restrictions.lockedPieces,
      maxAttempts: config.maxAttempts,
      maxStudentMoves: config.restrictions.maxStudentMoves,
      startFen: config.startFen,
      studentColor: config.studentColor,
      timeLimitSeconds: config.timeLimitSeconds
    };
  }

  private respond(run: RunRow, config: PlayoutConfig, game: GameRow): PlayoutGameResponse {
    const engineRetry =
      run.status === LiveClassActivityRunStatus.ACTIVE &&
      game.status === PlayoutGameStatus.IN_PROGRESS &&
      turnOfPlayout(game.fen, game.studentColor as PlayoutColor) === "COMPUTER";
    return {
      attemptsUsed: game.attemptNumber,
      canRetry: run.status === LiveClassActivityRunStatus.ACTIVE && !game.goalAchieved && game.attemptNumber < config.maxAttempts,
      engineRetry,
      game: this.toView(config, game),
      serverTime: new Date().toISOString()
    };
  }
}
