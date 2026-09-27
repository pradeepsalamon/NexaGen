import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  AddLiveSimulPlayerRequest,
  LiveSimul,
  LiveSimulEngineMoveRequest,
  LiveSimulGame,
  LiveSimulGameActionRequest,
  LiveSimulGameResponse,
  LiveSimulMessage,
  LiveSimulMoveRequest,
  LiveSimulStateResponse,
  SimulMove,
  StartLiveSimulRequest
} from "@nexa-chess/types";
import { encodeLiveSimul, LIVE_CLASS_SIMUL_TOPIC } from "@nexa-chess/types";
import {
  LiveSessionStatus,
  Prisma,
  SimulEndReason,
  SimulGameResult,
  SimulGameStatus,
  SimulSide,
  UserRole
} from "@prisma/client";
import { Chess } from "chess.js";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";
import { normalizeEngineFen, StockfishService } from "../stockfish/stockfish.service";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const gameInclude = {
  simul: { select: { id: true, liveClassId: true, startFen: true, status: true } },
  student: { select: { firstName: true, lastName: true } }
} satisfies Prisma.LiveClassSimulGameInclude;

type GameRow = Prisma.LiveClassSimulGameGetPayload<{ include: typeof gameInclude }>;

const simulInclude = {
  games: {
    include: { student: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.LiveClassSimulInclude;

type SimulRow = Prisma.LiveClassSimulGetPayload<{ include: typeof simulInclude }>;

type Outcome = { result: SimulGameResult; endReason: SimulEndReason };

type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

@Injectable()
export class LiveClassSimulService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService,
    private readonly stockfish: StockfishService
  ) {}

  /** Coach-owner / admin starts a simul against the chosen students (ends any running one). */
  async start(
    accessToken: string | undefined,
    classId: string,
    dto: StartLiveSimulRequest
  ): Promise<LiveSimulStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });

    const startFen = this.resolveStartFen(dto.startFen);
    const studentIds = [...new Set(dto.studentIds)];
    const rosterIds = new Set((await this.loadRoster(classId)).map((s) => s.id));
    const outsiders = studentIds.filter((id) => !rosterIds.has(id));
    if (outsiders.length > 0) {
      throw new BadRequestException("Every player must be a student enrolled in this class.");
    }

    const colorMode = dto.colorMode ?? "WHITE";
    let created: SimulRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.closeActive(tx, classId);
        return tx.liveClassSimul.create({
          data: {
            colorMode,
            games: {
              create: studentIds.map((studentId, index) => ({
                coachIsWhite: this.coachIsWhite(colorMode, index),
                fen: startFen,
                studentId
              }))
            },
            liveClassId: classId,
            startFen,
            startedById: user.id
          },
          include: simulInclude
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A simul was just started in this class.");
      }
      throw error;
    }

    await this.broadcast(liveSession.roomName, { type: "SIMUL_CHANGED", simulId: created.id });
    return { simul: this.toSimul(created) };
  }

  /** Coach-owner / admin ends the running simul; unfinished games stay unscored. */
  async end(accessToken: string | undefined, classId: string): Promise<LiveSimulStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const simulId = await this.prisma.$transaction((tx) => this.closeActive(tx, classId));
    if (!simulId) return { simul: null };

    await this.broadcast(liveSession.roomName, { type: "SIMUL_ENDED", simulId });
    const row = await this.prisma.liveClassSimul.findUnique({
      where: { id: simulId },
      include: simulInclude
    });
    return { simul: row ? this.toSimul(row) : null };
  }

  /** Coach-owner / admin adds a late joiner to the running simul. */
  async addPlayer(
    accessToken: string | undefined,
    classId: string,
    dto: AddLiveSimulPlayerRequest
  ): Promise<LiveSimulGameResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const simul = await this.prisma.liveClassSimul.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" },
      include: { _count: { select: { games: true } } }
    });
    if (!simul) throw new NotFoundException("No simul is running in this class.");

    const roster = await this.loadRoster(classId);
    if (!roster.some((s) => s.id === dto.studentId)) {
      throw new BadRequestException("That student is not enrolled in this class.");
    }

    let game: GameRow;
    try {
      game = await this.prisma.liveClassSimulGame.create({
        data: {
          coachIsWhite: this.coachIsWhite(simul.colorMode, simul._count.games),
          fen: simul.startFen,
          simulId: simul.id,
          studentId: dto.studentId
        },
        include: gameInclude
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("That student is already playing in this simul.");
      }
      throw error;
    }

    await this.broadcast(liveSession.roomName, { type: "SIMUL_CHANGED", simulId: simul.id });
    return { game: this.toGame(game) };
  }

  /** Any participant: the running (or most recent) simul. Students only see their own game. */
  async getCurrent(accessToken: string | undefined, classId: string): Promise<LiveSimulStateResponse> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);
    const row =
      (await this.prisma.liveClassSimul.findFirst({
        where: { liveClassId: classId, status: "ACTIVE" },
        include: simulInclude
      })) ??
      (await this.prisma.liveClassSimul.findFirst({
        where: { liveClassId: classId },
        orderBy: { startedAt: "desc" },
        include: simulInclude
      }));
    if (!row) return { simul: null };

    const simul = this.toSimul(row);
    if (user.role === UserRole.STUDENT) {
      simul.games = simul.games.filter((g) => g.studentId === user.id);
    }
    return { simul };
  }

  /** The coach or that game's student plays a move. */
  async move(
    accessToken: string | undefined,
    classId: string,
    gameId: string,
    dto: LiveSimulMoveRequest
  ): Promise<LiveSimulGameResponse> {
    const { game, side, roomName } = await this.resolvePlayer(accessToken, classId, gameId);
    return this.applyMove(roomName, game, side, dto.uci, dto.ply, false);
  }

  /** Coach-owner / admin plays Stockfish's move on one board. */
  async engineMove(
    accessToken: string | undefined,
    classId: string,
    gameId: string,
    dto: LiveSimulEngineMoveRequest
  ): Promise<LiveSimulGameResponse> {
    const { game, side, roomName } = await this.resolvePlayer(accessToken, classId, gameId);
    if (side !== "COACH") throw new ForbiddenException("Only the coach can play engine moves.");
    this.assertPlayable(game, side, dto.ply);

    const best = await this.stockfish.getBestMove(game.fen, { skillLevel: dto.skillLevel });
    if (!best) throw new BadRequestException("The engine found no move in this position.");
    return this.applyMove(roomName, game, side, best.uci, dto.ply, true);
  }

  /** Resign, offer / accept / decline a draw, or (coach) settle the game by hand. */
  async action(
    accessToken: string | undefined,
    classId: string,
    gameId: string,
    dto: LiveSimulGameActionRequest
  ): Promise<LiveSimulGameResponse> {
    const { game, side, roomName } = await this.resolvePlayer(accessToken, classId, gameId);
    if (game.status !== SimulGameStatus.ONGOING) throw new BadRequestException("This game is over.");
    const other: SimulSide = side === "COACH" ? "STUDENT" : "COACH";

    let where: Prisma.LiveClassSimulGameWhereInput = { id: game.id, status: SimulGameStatus.ONGOING };
    let data: Prisma.LiveClassSimulGameUpdateManyMutationInput;

    switch (dto.action) {
      case "RESIGN":
        data = this.finish({
          endReason: SimulEndReason.RESIGNATION,
          result: side === "COACH" ? SimulGameResult.STUDENT_WON : SimulGameResult.COACH_WON
        });
        break;
      case "OFFER_DRAW":
        // Offering while the other side's offer stands is an acceptance.
        data =
          game.drawOfferedBy === other
            ? this.finish({ endReason: SimulEndReason.DRAW_AGREED, result: SimulGameResult.DRAW })
            : { drawOfferedBy: side };
        break;
      case "ACCEPT_DRAW":
        if (game.drawOfferedBy !== other) throw new BadRequestException("There is no draw offer to accept.");
        where = { ...where, drawOfferedBy: other };
        data = this.finish({ endReason: SimulEndReason.DRAW_AGREED, result: SimulGameResult.DRAW });
        break;
      case "DECLINE_DRAW":
        if (game.drawOfferedBy !== other) throw new BadRequestException("There is no draw offer to decline.");
        where = { ...where, drawOfferedBy: other };
        data = { drawOfferedBy: null };
        break;
      case "ADJUDICATE":
        if (side !== "COACH") throw new ForbiddenException("Only the coach can decide a game.");
        data = this.finish({ endReason: SimulEndReason.ADJUDICATED, result: dto.result });
        break;
    }

    const updated = await this.prisma.liveClassSimulGame.updateMany({ where, data });
    if (updated.count === 0) throw new ConflictException("The game changed — refresh and try again.");
    return this.publishGame(roomName, game.id);
  }

  // ── internals ──

  private async resolvePlayer(accessToken: string | undefined, classId: string, gameId: string) {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }
    const game = await this.prisma.liveClassSimulGame.findUnique({
      where: { id: gameId },
      include: gameInclude
    });
    if (!game || game.simul.liveClassId !== classId) throw new NotFoundException("Game not found.");
    if (game.simul.status !== "ACTIVE") throw new BadRequestException("This simul has ended.");

    // resolveParticipant already limited coaches to the class owner.
    let side: SimulSide;
    if (user.id === game.studentId) side = "STUDENT";
    else if (user.role !== UserRole.STUDENT) side = "COACH";
    else throw new ForbiddenException("This is not your game.");

    return { game, side, roomName: liveSession.roomName };
  }

  private assertPlayable(game: GameRow, side: SimulSide, ply: number) {
    if (game.status !== SimulGameStatus.ONGOING) throw new BadRequestException("This game is over.");
    if (game.ply !== ply) throw new ConflictException("The board changed — refresh and try again.");
    if (this.turnOf(game) !== side) throw new BadRequestException("It is not your move.");
  }

  private async applyMove(
    roomName: string,
    game: GameRow,
    side: SimulSide,
    uci: string,
    ply: number,
    engine: boolean
  ): Promise<LiveSimulGameResponse> {
    this.assertPlayable(game, side, ply);

    const chess = this.replay(game);
    let played;
    try {
      played = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    } catch {
      played = null;
    }
    if (!played) throw new BadRequestException("That move is not legal.");

    const move: SimulMove = {
      by: side,
      san: played.san,
      uci: `${played.from}${played.to}${played.promotion ?? ""}`,
      ...(engine ? { engine: true } : {})
    };
    const outcome = this.outcomeAfter(chess, side);
    const now = new Date();

    const updated = await this.prisma.liveClassSimulGame.updateMany({
      where: { id: game.id, ply, status: SimulGameStatus.ONGOING },
      data: {
        drawOfferedBy: null,
        fen: chess.fen(),
        lastMoveAt: now,
        movesJson: [...this.movesOf(game.movesJson), move] as unknown as Prisma.InputJsonValue,
        ply: ply + 1,
        ...(engine ? { engineMoves: { increment: 1 } } : {}),
        ...(outcome ? this.finish(outcome, now) : {})
      }
    });
    if (updated.count === 0) throw new ConflictException("The board changed — refresh and try again.");
    return this.publishGame(roomName, game.id);
  }

  private async publishGame(roomName: string, gameId: string): Promise<LiveSimulGameResponse> {
    const row = await this.prisma.liveClassSimulGame.findUniqueOrThrow({
      where: { id: gameId },
      include: gameInclude
    });
    const game = this.toGame(row);
    await this.broadcast(roomName, { type: "SIMUL_GAME", game });
    return { game };
  }

  private finish(outcome: Outcome, at = new Date()): Prisma.LiveClassSimulGameUpdateManyMutationInput {
    return {
      drawOfferedBy: null,
      endReason: outcome.endReason,
      finishedAt: at,
      result: outcome.result,
      status: SimulGameStatus.FINISHED
    };
  }

  /** Closes the class's running simul inside `tx`; returns its id, or null when none ran. */
  private async closeActive(tx: PrismaTx, classId: string): Promise<string | null> {
    const active = await tx.liveClassSimul.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!active) return null;
    const now = new Date();
    await tx.liveClassSimulGame.updateMany({
      where: { simulId: active.id, status: SimulGameStatus.ONGOING },
      data: {
        drawOfferedBy: null,
        endReason: SimulEndReason.SIMUL_ENDED,
        finishedAt: now,
        status: SimulGameStatus.FINISHED
      }
    });
    await tx.liveClassSimul.update({
      where: { id: active.id },
      data: { endedAt: now, status: "ENDED" }
    });
    return active.id;
  }

  /** Rebuilt from the start so threefold repetition sees the whole game. */
  private replay(game: GameRow): Chess {
    try {
      const chess = new Chess(game.simul.startFen);
      for (const m of this.movesOf(game.movesJson)) {
        chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci.slice(4) || undefined });
      }
      if (chess.fen() === game.fen) return chess;
    } catch {
      // Fall through to the stored position.
    }
    return new Chess(game.fen);
  }

  private outcomeAfter(chess: Chess, mover: SimulSide): Outcome | null {
    if (chess.isCheckmate()) {
      return {
        endReason: SimulEndReason.CHECKMATE,
        result: mover === "COACH" ? SimulGameResult.COACH_WON : SimulGameResult.STUDENT_WON
      };
    }
    const draw = (endReason: SimulEndReason): Outcome => ({ endReason, result: SimulGameResult.DRAW });
    if (chess.isStalemate()) return draw(SimulEndReason.STALEMATE);
    if (chess.isInsufficientMaterial()) return draw(SimulEndReason.INSUFFICIENT_MATERIAL);
    if (chess.isThreefoldRepetition()) return draw(SimulEndReason.THREEFOLD_REPETITION);
    if (chess.isDraw()) return draw(SimulEndReason.FIFTY_MOVE_RULE);
    return null;
  }

  private resolveStartFen(input: string | undefined): string {
    if (!input?.trim()) return STANDARD_FEN;
    const check = normalizeEngineFen(input);
    if (!check.ok) throw new BadRequestException(check.reason);
    if (new Chess(check.fen).isGameOver()) {
      throw new BadRequestException("The starting position is already finished.");
    }
    return check.fen;
  }

  private coachIsWhite(mode: string, index: number): boolean {
    if (mode === "BLACK") return false;
    if (mode === "ALTERNATE") return index % 2 === 0;
    return true;
  }

  private turnOf(game: { status: SimulGameStatus; fen: string; coachIsWhite: boolean }): SimulSide | null {
    if (game.status !== SimulGameStatus.ONGOING) return null;
    const whiteToMove = game.fen.split(" ")[1] !== "b";
    return whiteToMove === game.coachIsWhite ? "COACH" : "STUDENT";
  }

  private movesOf(value: Prisma.JsonValue): SimulMove[] {
    return Array.isArray(value) ? (value as unknown as SimulMove[]) : [];
  }

  private async loadRoster(classId: string): Promise<{ id: string }[]> {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { batch: { include: { students: { where: { isDeleted: false }, select: { studentId: true } } } } }
    });
    return (liveSession?.batch?.students ?? []).map((bs) => ({ id: bs.studentId }));
  }

  private toSimul(row: SimulRow): LiveSimul {
    return {
      colorMode: row.colorMode,
      endedAt: row.endedAt?.toISOString() ?? null,
      games: row.games.map((g) => this.toGame(g)),
      id: row.id,
      startFen: row.startFen,
      startedAt: row.startedAt.toISOString(),
      status: row.status
    };
  }

  private toGame(
    row: Omit<GameRow, "simul"> & { simulId: string }
  ): LiveSimulGame {
    return {
      coachColor: row.coachIsWhite ? "white" : "black",
      drawOfferedBy: row.drawOfferedBy,
      endReason: row.endReason,
      engineMoves: row.engineMoves,
      fen: row.fen,
      id: row.id,
      moves: this.movesOf(row.movesJson),
      ply: row.ply,
      result: row.result,
      simulId: row.simulId,
      status: row.status,
      studentId: row.studentId,
      studentName: fullName(row.student) ?? "Student",
      turn: this.turnOf(row),
      turnSince: (row.lastMoveAt ?? row.createdAt).toISOString()
    };
  }

  private async broadcast(roomName: string, message: LiveSimulMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(roomName, encodeLiveSimul(message), LIVE_CLASS_SIMUL_TOPIC);
    } catch {
      // Nudge only — REST is authoritative and clients refetch on reconnect.
    }
  }
}
