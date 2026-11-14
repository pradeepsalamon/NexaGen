import { Injectable, Logger } from "@nestjs/common";
import {
  lineThroughPath,
  moveTreeFromMoves,
  moveTreeHasVariations,
  moveTreeToPgn,
  parsePgnToMoveTree,
  type ChessGameResult,
  type LiveBoardState,
  type MoveTree,
  type PgnHeaders,
} from "@nexa-chess/types";
import { ChessGameSource, ChessGameStatus, Prisma } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { createMoveTreeChess } from "../common/chess/move-tree-chess";
import { PrismaService } from "../prisma/prisma.service";

type StoredMove = { san: string; uci: string };

type ClassContext = {
  id: string;
  title: string | null;
  topic: string | null;
  batchId: string | null;
  batch: { name: string } | null;
};

const classInclude = {
  batch: { select: { name: true } },
} as const;

const nameOf = (u: { firstName: string; lastName: string | null } | null | undefined, fallback: string) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || fallback : fallback;

const humanize = (value: string | null | undefined) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ") : null;

/** "2026.10.15" — the PGN Date tag, in UTC (the stored instant's own day). */
const pgnDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, ".");

/**
 * Copies every game played in a live class into the Game Library
 * (`chess_games`). Called fire-and-forget after the source row changes, so a
 * library failure can never fail a move.
 *
 * Idempotency: one row per `sourceKey` (unique), so a replayed call, an
 * autosave or a reconnect updates the same game. Ordering: a write only lands
 * when its `sourceRevision` is higher than the stored one, so a late, older
 * call can never overwrite newer moves.
 */
@Injectable()
export class GameRecorderService {
  private readonly logger = new Logger(GameRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws; logs instead. */
  recordMatchGameInBackground(gameId: string) {
    void this.recordMatchGame(gameId).catch((err) => this.warn(`match game ${gameId}`, err));
  }

  recordMatchRoundInBackground(roundId: string) {
    void this.prisma.liveClassMatchGame
      .findMany({ select: { id: true }, where: { roundId } })
      .then((games) => Promise.all(games.map((g) => this.recordMatchGame(g.id))))
      .catch((err) => this.warn(`match round ${roundId}`, err));
  }

  recordSimulGameInBackground(gameId: string) {
    void this.recordSimulGame(gameId).catch((err) => this.warn(`simul game ${gameId}`, err));
  }

  recordSimulInBackground(simulId: string) {
    void this.prisma.liveClassSimulGame
      .findMany({ select: { id: true }, where: { simulId } })
      .then((games) => Promise.all(games.map((g) => this.recordSimulGame(g.id))))
      .catch((err) => this.warn(`simul ${simulId}`, err));
  }

  recordBoardStateInBackground(liveSessionId: string, classId: string, state: LiveBoardState) {
    void this.recordBoardState(liveSessionId, classId, state).catch((err) =>
      this.warn(`board of class ${classId}`, err),
    );
  }

  /** Marks the class board's open games finished (class ended). */
  async completeClassBoardGames(classId: string, at = new Date()): Promise<number> {
    const { count } = await this.prisma.chessGame.updateMany({
      data: { endedAt: at, status: ChessGameStatus.COMPLETED },
      where: { classId, source: ChessGameSource.LIVE_BOARD, status: ChessGameStatus.IN_PROGRESS },
    });
    return count;
  }

  async recordMatchGame(gameId: string): Promise<void> {
    const game = await this.prisma.liveClassMatchGame.findUnique({
      include: {
        black: { select: { firstName: true, lastName: true } },
        round: { include: { liveClass: { include: classInclude } } },
        white: { select: { firstName: true, lastName: true } },
      },
      where: { id: gameId },
    });
    // A pairing nobody moved in is not a game.
    if (!game || game.ply === 0) return;
    const finished = game.status === "FINISHED";
    const result: ChessGameResult =
      game.result === "WHITE_WON" ? "1-0" : game.result === "BLACK_WON" ? "0-1" : game.result === "DRAW" ? "1/2-1/2" : "*";
    const whiteName = nameOf(game.white, "White");
    const blackName = nameOf(game.black, "Black");
    await this.upsert({
      blackName,
      blackPlayerId: game.blackId,
      classCtx: game.round.liveClass,
      endedAt: game.finishedAt,
      moves: this.movesOf(game.movesJson),
      result,
      revision: BigInt(game.ply * 2 + (finished ? 1 : 0)),
      source: ChessGameSource.MATCH,
      sourceKey: `match:${game.id}`,
      startFen: game.round.startFen,
      startedAt: game.createdAt,
      status: finished ? ChessGameStatus.COMPLETED : ChessGameStatus.IN_PROGRESS,
      termination: humanize(game.endReason),
      title: `${whiteName} vs ${blackName}`,
      whiteName,
      whitePlayerId: game.whiteId,
    });
  }

  async recordSimulGame(gameId: string): Promise<void> {
    const game = await this.prisma.liveClassSimulGame.findUnique({
      include: {
        simul: {
          include: {
            liveClass: { include: { ...classInclude, coach: { select: { firstName: true, id: true, lastName: true } } } },
            startedBy: { select: { firstName: true, id: true, lastName: true } },
          },
        },
        student: { select: { firstName: true, lastName: true } },
      },
      where: { id: gameId },
    });
    if (!game || game.ply === 0) return;
    const coach = game.simul.startedBy ?? game.simul.liveClass.coach;
    const coachName = nameOf(coach, "Coach");
    const studentName = nameOf(game.student, "Student");
    const finished = game.status === "FINISHED";
    const coachWhite = game.coachIsWhite;
    const result: ChessGameResult =
      game.result === "DRAW"
        ? "1/2-1/2"
        : game.result === "COACH_WON"
          ? coachWhite
            ? "1-0"
            : "0-1"
          : game.result === "STUDENT_WON"
            ? coachWhite
              ? "0-1"
              : "1-0"
            : "*";
    const whiteName = coachWhite ? coachName : studentName;
    const blackName = coachWhite ? studentName : coachName;
    await this.upsert({
      blackName,
      blackPlayerId: coachWhite ? game.studentId : coach?.id ?? null,
      classCtx: game.simul.liveClass,
      endedAt: game.finishedAt,
      moves: this.movesOf(game.movesJson),
      result,
      revision: BigInt(game.ply * 2 + (finished ? 1 : 0)),
      source: ChessGameSource.SIMUL,
      sourceKey: `simul:${game.id}`,
      startFen: game.simul.startFen,
      startedAt: game.createdAt,
      status: finished ? ChessGameStatus.COMPLETED : ChessGameStatus.IN_PROGRESS,
      termination: humanize(game.endReason),
      title: `Simul: ${whiteName} vs ${blackName}`,
      whiteName,
      whitePlayerId: coachWhite ? coach?.id ?? null : game.studentId,
    });
  }

  /**
   * The coach's shared board. Each `gameId` the board reports (a new one on
   * every reset / load / set-up) is its own library game; starting a new one
   * closes the previous one. A position nobody played a move from is not a
   * game and is not recorded.
   */
  async recordBoardState(liveSessionId: string, classId: string, state: LiveBoardState): Promise<void> {
    const boardGameId = state.gameId || "board";
    const sourceKey = `board:${liveSessionId}:${boardGameId}`;
    const tree = this.boardTree(state);
    if (!tree) return;
    const mainline = lineThroughPath(tree, []).nodes;
    if (mainline.length === 0 && !moveTreeHasVariations(tree)) return;

    const cls = await this.prisma.coachClass.findUnique({
      include: { ...classInclude, coach: { select: { firstName: true, lastName: true } } },
      where: { id: classId },
    });
    if (!cls) return;

    const now = new Date();
    // A different board game is now on the board: the previous one is over.
    await this.prisma.chessGame.updateMany({
      data: { endedAt: now, status: ChessGameStatus.COMPLETED },
      where: {
        source: ChessGameSource.LIVE_BOARD,
        sourceKey: { not: sourceKey, startsWith: `board:${liveSessionId}:` },
        status: ChessGameStatus.IN_PROGRESS,
      },
    });

    const label = cls.title || cls.topic || "Class";
    await this.upsert({
      blackName: "Black",
      blackPlayerId: null,
      classCtx: cls,
      endedAt: null,
      result: "*",
      revision: BigInt(Math.max(0, Math.floor(state.savedAt ?? now.getTime()))),
      source: ChessGameSource.LIVE_BOARD,
      sourceKey,
      startFen: tree.rootFen,
      startedAt: now,
      status: ChessGameStatus.IN_PROGRESS,
      termination: null,
      title: `${label} — class board (${nameOf(cls.coach, "Coach")})`,
      tree,
      whiteName: "White",
      whitePlayerId: null,
    });
  }

  private boardTree(state: LiveBoardState): MoveTree | null {
    for (const pgn of [state.treePgn, state.pgn]) {
      if (!pgn) continue;
      try {
        return parsePgnToMoveTree(pgn, createMoveTreeChess).tree;
      } catch {
        // fall through to the next representation
      }
    }
    return null;
  }

  private movesOf(json: Prisma.JsonValue): StoredMove[] {
    return Array.isArray(json)
      ? (json as unknown[]).filter(
          (m): m is StoredMove => !!m && typeof m === "object" && typeof (m as StoredMove).uci === "string",
        )
      : [];
  }

  /** Linear tree from a list of stored moves, replayed so every node has its FEN. */
  private treeFromMoves(startFen: string, moves: StoredMove[]): MoveTree {
    const root = new Chess(startFen).fen();
    const chess = new Chess(root);
    const nodes: { san: string; uci: string; fen: string }[] = [];
    for (const m of moves) {
      try {
        const played = chess.move({ from: m.uci.slice(0, 2), promotion: m.uci.slice(4) || undefined, to: m.uci.slice(2, 4) });
        nodes.push({ fen: chess.fen(), san: played.san, uci: m.uci });
      } catch {
        break;
      }
    }
    return moveTreeFromMoves(root, nodes);
  }

  private async upsert(input: {
    source: ChessGameSource;
    sourceKey: string;
    revision: bigint;
    title: string;
    classCtx: ClassContext;
    startFen: string;
    moves?: StoredMove[];
    tree?: MoveTree;
    whiteName: string;
    blackName: string;
    whitePlayerId: string | null;
    blackPlayerId: string | null;
    status: ChessGameStatus;
    result: ChessGameResult;
    termination: string | null;
    startedAt: Date;
    endedAt: Date | null;
  }): Promise<void> {
    const tree = input.tree ?? this.treeFromMoves(input.startFen, input.moves ?? []);
    const headers: PgnHeaders = {
      Black: input.blackName,
      Date: pgnDate(input.startedAt),
      Event: input.classCtx.title || input.classCtx.topic || "Nexa Chess class",
      Result: input.result,
      Site: "Nexa Chess",
      White: input.whiteName,
      ...(input.termination ? { Termination: input.termination } : {}),
    };
    const data = {
      batchId: input.classCtx.batchId,
      blackName: input.blackName,
      blackPlayerId: input.blackPlayerId,
      classId: input.classCtx.id,
      endedAt: input.endedAt,
      hasVariations: moveTreeHasVariations(tree),
      moveCount: lineThroughPath(tree, []).nodes.length,
      pgn: moveTreeToPgn(tree, headers),
      result: input.result,
      sourceRevision: input.revision,
      startFen: tree.rootFen,
      status: input.status,
      termination: input.termination,
      title: input.title.slice(0, 200),
      whiteName: input.whiteName,
      whitePlayerId: input.whitePlayerId,
    };

    const existing = await this.prisma.chessGame.findUnique({
      select: { sourceRevision: true },
      where: { sourceKey: input.sourceKey },
    });
    if (!existing) {
      try {
        await this.prisma.chessGame.create({
          data: { ...data, source: input.source, sourceKey: input.sourceKey, startedAt: input.startedAt },
        });
        return;
      } catch (err) {
        // Lost a create race to a concurrent call — fall through to the guarded update.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    } else if (existing.sourceRevision >= input.revision) {
      return;
    }
    // A class-board game is only ever closed, never re-opened: a save that
    // raced the class ending must not flip it back to in-progress.
    const { status, endedAt, ...rest } = data;
    await this.prisma.chessGame.updateMany({
      data: input.source === ChessGameSource.LIVE_BOARD ? rest : { ...rest, endedAt, status },
      where: { sourceKey: input.sourceKey, sourceRevision: { lt: input.revision } },
    });
  }

  private warn(what: string, err: unknown) {
    this.logger.warn(`Game Library: could not record ${what}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
