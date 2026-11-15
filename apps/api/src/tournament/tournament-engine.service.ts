import { ConflictException, Injectable } from "@nestjs/common";
import {
  resolveNextRoundAt,
  TOURNAMENT_FIRST_MOVE_SECONDS,
  tournamentArenaConfigSchema,
  tournamentKnockoutConfigSchema,
  tournamentRoundScheduleSchema,
  type TournamentKnockoutConfig,
  type TournamentRoundSchedule
} from "@nexa-chess/types";
import {
  Prisma,
  TournamentAuditAction,
  TournamentByeKind,
  TournamentEndReason,
  TournamentFormat,
  TournamentGameResult,
  TournamentGameStatus,
  TournamentKnockoutDecision,
  TournamentKnockoutMatchStatus,
  TournamentPlayerStatus,
  TournamentResultSource,
  TournamentRoundStatus,
  TournamentStatus,
  type Tournament,
  type TournamentGame
} from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";
import { arenaPairings } from "./pairing/arena";
import { bracketRounds, firstRoundMatches, knockoutMatchState, nextSlot, type MatchGame } from "./pairing/knockout";
import { roundRobinSchedule } from "./pairing/round-robin";
import { computeStandings, type StandingRow } from "./pairing/standings";
import { pairSwissRound } from "./pairing/swiss";
import { seedOrder, type GameRecord } from "./pairing/types";
import { TournamentAuditService } from "./tournament-audit.service";

type Tx = PrismaTransactionClient;

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FIRST_MOVE_MS = TOURNAMENT_FIRST_MOVE_SECONDS * 1000;

/** Half-points for (White, Black) of a result. */
export function halfPointsOf(result: TournamentGameResult): [number, number] {
  switch (result) {
    case TournamentGameResult.WHITE_WON:
      return [2, 0];
    case TournamentGameResult.BLACK_WON:
      return [0, 2];
    case TournamentGameResult.DRAW:
      return [1, 1];
    case TournamentGameResult.NO_RESULT:
      return [0, 0];
  }
}

/** The stored round schedule (an unreadable value reads as none). */
export function roundScheduleOf(t: Pick<Tournament, "roundScheduleJson">): TournamentRoundSchedule {
  const parsed = tournamentRoundScheduleSchema.safeParse(t.roundScheduleJson ?? []);
  return parsed.success ? parsed.data : [];
}

const BYE_POINTS: Record<TournamentByeKind, number> = { FULL: 2, HALF: 1, ZERO: 0 };

/** Over-the-board games only: byes, forfeits, no-shows and voided games are not "played". */
export function wasPlayed(game: Pick<TournamentGame, "blackPlayerId" | "endReason" | "result">): boolean {
  if (!game.blackPlayerId || game.result === TournamentGameResult.NO_RESULT) return false;
  const reason = game.endReason as TournamentEndReason | null;
  return reason !== TournamentEndReason.FORFEIT && reason !== TournamentEndReason.NO_SHOW && reason !== TournamentEndReason.BYE;
}

export function toGameRecord(game: TournamentGame): GameRecord & { plies: number; whiteBerserk: boolean; blackBerserk: boolean; finishedOrder: number } {
  return {
    blackBerserk: game.blackBerserk,
    blackHalfPoints: game.blackHalfPoints,
    blackId: game.blackPlayerId,
    finishedOrder: game.finishedAt?.getTime() ?? 0,
    played: wasPlayed(game),
    plies: game.ply,
    round: game.roundNumber,
    whiteBerserk: game.whiteBerserk,
    whiteHalfPoints: game.whiteHalfPoints,
    whiteId: game.whitePlayerId
  };
}

export type GameOutcomeInput = {
  result: TournamentGameResult;
  endReason: TournamentEndReason;
  source: TournamentResultSource;
};

/**
 * The tournament's database engine (docs/TOURNAMENTS.md §3.4): every write
 * that changes who plays whom or who scored what goes through here, inside the
 * caller's transaction, after the caller locked the tournament row
 * (`lockTournament`). The pure engines in `pairing/` decide; this stores.
 */
@Injectable()
export class TournamentEngineService {
  constructor(private readonly audit: TournamentAuditService) {}

  /** Serializes every structural change of one tournament (pairing, results, standings). */
  async lockTournament(tx: Tx, id: string): Promise<Tournament> {
    await tx.$queryRaw`SELECT "id" FROM "tournaments" WHERE "id" = ${id} FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({ where: { id } });
    if (!tournament) throw new ConflictException("Tournament not found.");
    return tournament;
  }

  // ── games ──

  /** Creates a game and claims both players (a player already in a live game makes it fail). */
  async createGame(
    tx: Tx,
    t: Tournament,
    g: { whiteId: string; blackId: string; board: number; roundId?: string | null; roundNumber: number; knockoutMatchId?: string | null; gameNumber?: number }
  ): Promise<TournamentGame> {
    const now = new Date();
    const startFen = t.startFen ?? STANDARD_FEN;
    const game = await tx.tournamentGame.create({
      data: {
        blackClockMs: t.clockInitialMs,
        blackPlayerId: g.blackId,
        boardNumber: g.board,
        fen: startFen,
        firstMoveDeadline: new Date(now.getTime() + FIRST_MOVE_MS),
        gameNumber: g.gameNumber ?? 1,
        knockoutMatchId: g.knockoutMatchId ?? null,
        roundId: g.roundId ?? null,
        roundNumber: g.roundNumber,
        startFen,
        startedAt: now,
        tournamentId: t.id,
        turnSince: now,
        whiteClockMs: t.clockInitialMs,
        whitePlayerId: g.whiteId
      }
    });
    const { count } = await tx.tournamentPlayer.updateMany({
      data: { currentGameId: game.id },
      where: { currentGameId: null, id: { in: [g.whiteId, g.blackId] } }
    });
    if (count !== 2) throw new ConflictException("A player is already in a game.");
    return game;
  }

  async createBye(tx: Tx, t: Tournament, g: { playerId: string; kind: TournamentByeKind; roundId: string; roundNumber: number; board: number }) {
    const points = BYE_POINTS[g.kind];
    const startFen = t.startFen ?? STANDARD_FEN;
    return tx.tournamentGame.create({
      data: {
        blackClockMs: 0,
        boardNumber: g.board,
        byeKind: g.kind,
        endReason: TournamentEndReason.BYE,
        fen: startFen,
        finishedAt: new Date(),
        result: points === 2 ? TournamentGameResult.WHITE_WON : points === 1 ? TournamentGameResult.DRAW : TournamentGameResult.NO_RESULT,
        resultSource: TournamentResultSource.BYE,
        roundId: g.roundId,
        roundNumber: g.roundNumber,
        startFen,
        status: TournamentGameStatus.FINISHED,
        tournamentId: t.id,
        whiteClockMs: 0,
        whiteHalfPoints: points,
        whitePlayerId: g.playerId
      }
    });
  }

  // ── starting ──

  /** PUBLISHED → LIVE: seeds the field and starts round 1 / the bracket / the arena. */
  async start(tx: Tx, t: Tournament, actorId: string | null): Promise<void> {
    if (t.status !== TournamentStatus.PUBLISHED) throw new ConflictException("Only a published tournament can start.");
    const approved = await tx.tournamentPlayer.findMany({
      select: { id: true, seedRating: true },
      where: { status: TournamentPlayerStatus.APPROVED, tournamentId: t.id }
    });
    if (approved.length < Math.max(2, t.minPlayers)) {
      throw new ConflictException(`At least ${Math.max(2, t.minPlayers)} approved players are needed to start.`);
    }
    const seeded = seedOrder(approved.map((p) => ({ id: p.id, rating: p.seedRating })));
    for (const [i, p] of seeded.entries()) {
      await tx.tournamentPlayer.update({ data: { seedNumber: i + 1 }, where: { id: p.id } });
    }
    const now = new Date();
    const live = await tx.tournament.update({
      data: {
        arenaEndsAt: t.format === TournamentFormat.ARENA ? new Date(now.getTime() + (t.arenaDurationMin ?? 60) * 60_000) : null,
        startedAt: now,
        status: TournamentStatus.LIVE,
        version: { increment: 1 }
      },
      where: { id: t.id }
    });
    await this.audit.record(tx, { action: TournamentAuditAction.STARTED, actorId, after: { players: seeded.length }, tournamentId: t.id });
    if (t.format === TournamentFormat.KNOCKOUT) await this.buildBracket(tx, live, seeded.map((p) => p.id));
    else if (t.format === TournamentFormat.ARENA) await this.arenaTick(tx, live);
    else await this.startNextRound(tx, live, actorId);
    await this.recomputeStandings(tx, live);
  }

  /** Total rounds of a round format (Swiss: as configured; round robin: from the field). */
  async totalRounds(tx: Tx, t: Tournament): Promise<number | null> {
    if (t.format === TournamentFormat.SWISS) return t.rounds;
    if (t.format === TournamentFormat.ROUND_ROBIN) {
      const field = await tx.tournamentPlayer.count({ where: { seedNumber: { not: null }, tournamentId: t.id } });
      const perCycle = field % 2 === 0 ? field - 1 : field;
      return perCycle * (t.rounds === 2 ? 2 : 1);
    }
    if (t.format === TournamentFormat.KNOCKOUT) {
      const field = await tx.tournamentPlayer.count({ where: { seedNumber: { not: null }, tournamentId: t.id } });
      return bracketRounds(field);
    }
    return null;
  }

  /** Pairs and starts the next round of a Swiss / round robin. The caller holds the lock. */
  async startNextRound(tx: Tx, t: Tournament, actorId: string | null): Promise<number> {
    if (t.format !== TournamentFormat.SWISS && t.format !== TournamentFormat.ROUND_ROBIN) {
      throw new ConflictException("This format has no rounds to start.");
    }
    if (t.status !== TournamentStatus.LIVE) throw new ConflictException("The tournament isn't running.");
    const open = await tx.tournamentRound.count({ where: { status: TournamentRoundStatus.ONGOING, tournamentId: t.id } });
    if (open > 0) throw new ConflictException("The current round hasn't finished yet.");
    const total = (await this.totalRounds(tx, t)) ?? 0;
    const number = t.currentRound + 1;
    if (number > total) throw new ConflictException("Every round has been played.");

    const field = await tx.tournamentPlayer.findMany({
      select: { id: true, seedNumber: true, seedRating: true, status: true },
      where: { seedNumber: { not: null }, tournamentId: t.id }
    });
    const active = field.filter((p) => p.status === TournamentPlayerStatus.APPROVED);
    const games = (await tx.tournamentGame.findMany({ where: { tournamentId: t.id } })).map(toGameRecord);

    const round = await tx.tournamentRound.create({ data: { number, tournamentId: t.id } });
    await tx.tournament.update({ data: { currentRound: number, nextRoundAt: null, version: { increment: 1 } }, where: { id: t.id } });

    let pairings: { whiteId: string; blackId: string; board: number }[];
    let byes: { playerId: string; kind: TournamentByeKind }[];
    if (t.format === TournamentFormat.SWISS) {
      const result = pairSwissRound({
        games,
        players: active.map((p) => ({ id: p.id, rating: p.seedRating, seed: p.seedNumber! })),
        round: number
      });
      pairings = result.pairings;
      byes = result.byes.map((b) => ({ kind: b.kind as TournamentByeKind, playerId: b.playerId }));
    } else {
      // The whole schedule comes from the seeds; a withdrawn player's games are forfeits.
      const seedIds = [...field].sort((a, b) => a.seedNumber! - b.seedNumber!).map((p) => p.id);
      const scheduled = roundRobinSchedule(seedIds, t.rounds === 2 ? 2 : 1).find((r) => r.round === number)!;
      pairings = scheduled.pairings;
      byes = scheduled.byeId ? [{ kind: TournamentByeKind.FULL, playerId: scheduled.byeId }] : [];
    }

    const activeIds = new Set(active.map((p) => p.id));
    for (const p of pairings) {
      const whiteIn = activeIds.has(p.whiteId);
      const blackIn = activeIds.has(p.blackId);
      if (whiteIn && blackIn) {
        await this.createGame(tx, t, { blackId: p.blackId, board: p.board, roundId: round.id, roundNumber: number, whiteId: p.whiteId });
        continue;
      }
      // Round robin with a withdrawn player: the game is a forfeit for the one still in.
      const result = whiteIn ? TournamentGameResult.WHITE_WON : blackIn ? TournamentGameResult.BLACK_WON : TournamentGameResult.NO_RESULT;
      const [wp, bp] = halfPointsOf(result);
      await tx.tournamentGame.create({
        data: {
          blackClockMs: 0,
          blackHalfPoints: bp,
          blackPlayerId: p.blackId,
          boardNumber: p.board,
          endReason: TournamentEndReason.FORFEIT,
          fen: t.startFen ?? STANDARD_FEN,
          finishedAt: new Date(),
          result,
          resultSource: TournamentResultSource.FORFEIT,
          roundId: round.id,
          roundNumber: number,
          startFen: t.startFen ?? STANDARD_FEN,
          status: TournamentGameStatus.FINISHED,
          tournamentId: t.id,
          whiteClockMs: 0,
          whiteHalfPoints: wp,
          whitePlayerId: p.whiteId
        }
      });
    }
    let board = pairings.length;
    for (const bye of byes) {
      if (!activeIds.has(bye.playerId)) continue;
      board += 1;
      await this.createBye(tx, t, { board, kind: bye.kind, playerId: bye.playerId, roundId: round.id, roundNumber: number });
    }
    await this.audit.record(tx, { action: TournamentAuditAction.ROUND_STARTED, actorId, after: { round: number }, tournamentId: t.id });
    await this.completeRoundIfDone(tx, t.id, round.id);
    return number;
  }

  // ── knockout ──

  private knockoutConfig(t: Tournament): TournamentKnockoutConfig {
    const parsed = tournamentKnockoutConfigSchema.safeParse(t.knockoutConfigJson ?? {});
    return parsed.success ? parsed.data : { gamesPerMatch: 1, tiebreak: "SUDDEN_DEATH" };
  }

  private async buildBracket(tx: Tx, t: Tournament, seededIds: string[]) {
    const rounds = bracketRounds(seededIds.length);
    // Every match of every bracket round exists from the start; later rounds fill in.
    for (let r = 1; r <= rounds; r += 1) {
      const count = 2 ** (rounds - r);
      for (let slot = 0; slot < count; slot += 1) {
        await tx.tournamentKnockoutMatch.create({ data: { bracketRound: r, slot, tournamentId: t.id } });
      }
    }
    await tx.tournament.update({ data: { currentRound: 1 }, where: { id: t.id } });
    for (const m of firstRoundMatches(seededIds)) {
      const match = await tx.tournamentKnockoutMatch.update({
        data: { playerAId: m.aId, playerBId: m.bId },
        where: { tournamentId_bracketRound_slot: { bracketRound: 1, slot: m.slot, tournamentId: t.id } }
      });
      if (m.aId && !m.bId) await this.decideMatch(tx, t, match.id, m.aId, TournamentKnockoutDecision.BYE);
      else if (m.aId && m.bId) await this.nextKnockoutGame(tx, t, match.id);
    }
  }

  /** Starts the next game of a match, or decides it. */
  private async nextKnockoutGame(tx: Tx, t: Tournament, matchId: string) {
    const match = await tx.tournamentKnockoutMatch.findUniqueOrThrow({ include: { games: { orderBy: { gameNumber: "asc" } } }, where: { id: matchId } });
    if (match.status === TournamentKnockoutMatchStatus.DECIDED || !match.playerAId || !match.playerBId) return;
    if (match.games.some((g) => g.status === TournamentGameStatus.ONGOING)) return;
    // A side that was withdrawn or disqualified loses the match by forfeit.
    const sides = await tx.tournamentPlayer.findMany({ select: { id: true, status: true }, where: { id: { in: [match.playerAId, match.playerBId] } } });
    const out = sides.filter((p) => p.status !== TournamentPlayerStatus.APPROVED).map((p) => p.id);
    if (out.length > 0) {
      const winner = out.includes(match.playerAId) ? (out.includes(match.playerBId) ? match.playerAId : match.playerBId) : match.playerAId;
      await this.decideMatch(tx, t, match.id, winner, TournamentKnockoutDecision.FORFEIT);
      return;
    }
    const games: MatchGame[] = match.games.map((g) => {
      const aWhite = g.whitePlayerId === match.playerAId;
      return {
        aHalfPoints: (aWhite ? g.whiteHalfPoints : g.blackHalfPoints) ?? 0,
        aWhite,
        bHalfPoints: (aWhite ? g.blackHalfPoints : g.whiteHalfPoints) ?? 0
      };
    });
    const state = knockoutMatchState(this.knockoutConfig(t), games);
    if (state.status === "DECIDED") {
      await this.decideMatch(tx, t, match.id, state.winner === "A" ? match.playerAId : match.playerBId, state.by === "SEED" ? TournamentKnockoutDecision.SEED : TournamentKnockoutDecision.GAMES);
      return;
    }
    const round = await this.knockoutRoundRow(tx, t.id, match.bracketRound);
    await tx.tournamentKnockoutMatch.update({ data: { status: TournamentKnockoutMatchStatus.ONGOING }, where: { id: match.id } });
    await this.createGame(tx, t, {
      blackId: state.aWhite ? match.playerBId : match.playerAId,
      board: match.slot + 1,
      gameNumber: match.games.length + 1,
      knockoutMatchId: match.id,
      roundId: null,
      roundNumber: round.number,
      whiteId: state.aWhite ? match.playerAId : match.playerBId
    });
  }

  private async knockoutRoundRow(tx: Tx, tournamentId: string, bracketRound: number) {
    const existing = await tx.tournamentRound.findUnique({ where: { tournamentId_number: { number: bracketRound, tournamentId } } });
    if (existing) return existing;
    // Only forwards: byes can open round 2 while round 1 is still being played.
    await tx.tournament.updateMany({ data: { currentRound: bracketRound }, where: { currentRound: { lt: bracketRound }, id: tournamentId } });
    return tx.tournamentRound.create({ data: { number: bracketRound, tournamentId } });
  }

  async decideMatch(tx: Tx, t: Tournament, matchId: string, winnerId: string, by: TournamentKnockoutDecision) {
    const { count } = await tx.tournamentKnockoutMatch.updateMany({
      data: { decidedAt: new Date(), decidedBy: by, status: TournamentKnockoutMatchStatus.DECIDED, winnerId },
      where: { id: matchId, status: { not: TournamentKnockoutMatchStatus.DECIDED } }
    });
    if (count === 0) return;
    const match = await tx.tournamentKnockoutMatch.findUniqueOrThrow({ where: { id: matchId } });
    const total = await this.totalRounds(tx, t);
    // Close the bracket round once every match in it is decided.
    const undecided = await tx.tournamentKnockoutMatch.count({
      where: { bracketRound: match.bracketRound, status: { not: TournamentKnockoutMatchStatus.DECIDED }, tournamentId: t.id }
    });
    if (undecided === 0) {
      const round = await this.knockoutRoundRow(tx, t.id, match.bracketRound);
      await tx.tournamentRound.updateMany({
        data: { completedAt: new Date(), status: TournamentRoundStatus.COMPLETED },
        where: { id: round.id, status: TournamentRoundStatus.ONGOING }
      });
    }
    if (match.bracketRound === total) {
      await this.complete(tx, t, null);
      return;
    }
    const next = nextSlot(match.slot);
    const nextMatch = await tx.tournamentKnockoutMatch.update({
      data: next.side === "A" ? { playerAId: winnerId } : { playerBId: winnerId },
      where: { tournamentId_bracketRound_slot: { bracketRound: match.bracketRound + 1, slot: next.slot, tournamentId: t.id } }
    });
    // A higher seed always sits on side A; the side it fills is decided by the bracket shape.
    if (nextMatch.playerAId && nextMatch.playerBId) await this.nextKnockoutGame(tx, t, nextMatch.id);
  }

  // ── arena ──

  /** Pairs every free, active player of a running arena. The caller holds the lock. */
  async arenaTick(tx: Tx, t: Tournament): Promise<number> {
    if (t.format !== TournamentFormat.ARENA || t.status !== TournamentStatus.LIVE) return 0;
    if (t.arenaEndsAt && t.arenaEndsAt.getTime() <= Date.now()) return 0;
    const waiting = await tx.tournamentPlayer.findMany({
      select: { id: true, rank: true, seedNumber: true },
      where: { arenaPausedAt: null, currentGameId: null, status: TournamentPlayerStatus.APPROVED, tournamentId: t.id }
    });
    if (waiting.length < 2) return 0;
    const recent = await tx.tournamentGame.findMany({
      orderBy: { startedAt: "desc" },
      select: { blackPlayerId: true, whitePlayerId: true },
      where: { OR: [{ whitePlayerId: { in: waiting.map((w) => w.id) } }, { blackPlayerId: { in: waiting.map((w) => w.id) } }], tournamentId: t.id }
    });
    const lastOpponent = new Map<string, string | null>();
    const colorDiff = new Map<string, number>();
    for (const g of recent) {
      for (const [me, them, delta] of [
        [g.whitePlayerId, g.blackPlayerId, 1],
        [g.blackPlayerId, g.whitePlayerId, -1]
      ] as const) {
        if (!me) continue;
        if (!lastOpponent.has(me)) lastOpponent.set(me, them);
        colorDiff.set(me, (colorDiff.get(me) ?? 0) + delta);
      }
    }
    const pairs = arenaPairings(
      waiting.map((w) => ({
        colorDiff: colorDiff.get(w.id) ?? 0,
        id: w.id,
        lastOpponentId: lastOpponent.get(w.id) ?? null,
        rank: w.rank ?? 10_000 + (w.seedNumber ?? 0)
      }))
    );
    let board = await tx.tournamentGame.count({ where: { tournamentId: t.id } });
    for (const p of pairs) {
      board += 1;
      await this.createGame(tx, t, { blackId: p.blackId, board, roundNumber: 0, whiteId: p.whiteId });
    }
    return pairs.length;
  }

  // ── results ──

  /**
   * The one result funnel (docs/TOURNAMENTS.md §3.4): claims the game (status,
   * and ply when given), frees both players, then moves the tournament on —
   * the next knockout game, the round's completion — and rewrites the
   * standings. Returns false when another process finished it first.
   */
  async finishGame(
    tx: Tx,
    t: Tournament,
    gameId: string,
    outcome: GameOutcomeInput,
    options: { ply?: number; extra?: Prisma.TournamentGameUpdateManyMutationInput; actorId?: string | null } = {}
  ): Promise<boolean> {
    const [wp, bp] = halfPointsOf(outcome.result);
    const { count } = await tx.tournamentGame.updateMany({
      data: {
        ...options.extra,
        blackHalfPoints: bp,
        drawOfferedBy: null,
        endReason: outcome.endReason,
        finishedAt: new Date(),
        firstMoveDeadline: null,
        result: outcome.result,
        resultSource: outcome.source,
        status: TournamentGameStatus.FINISHED,
        whiteHalfPoints: wp
      },
      where: { id: gameId, status: TournamentGameStatus.ONGOING, ...(options.ply !== undefined ? { ply: options.ply } : {}) }
    });
    if (count === 0) return false;
    await tx.tournamentPlayer.updateMany({ data: { currentGameId: null }, where: { currentGameId: gameId } });
    const game = await tx.tournamentGame.findUniqueOrThrow({ where: { id: gameId } });

    // Arena: a no-show leaves the pool until they rejoin.
    if (t.format === TournamentFormat.ARENA && outcome.endReason === TournamentEndReason.NO_SHOW) {
      const absent = outcome.result === TournamentGameResult.BLACK_WON ? game.whitePlayerId : game.blackPlayerId;
      if (absent) await tx.tournamentPlayer.update({ data: { arenaPausedAt: new Date() }, where: { id: absent } });
    }
    if (game.knockoutMatchId) await this.nextKnockoutGame(tx, t, game.knockoutMatchId);
    if (game.roundId) await this.completeRoundIfDone(tx, t.id, game.roundId);
    await this.recomputeStandings(tx, t);
    if (t.format === TournamentFormat.ARENA) await this.completeArenaIfOver(tx, t);
    return true;
  }

  async completeRoundIfDone(tx: Tx, tournamentId: string, roundId: string) {
    const ongoing = await tx.tournamentGame.count({ where: { roundId, status: TournamentGameStatus.ONGOING } });
    if (ongoing > 0) return;
    const { count } = await tx.tournamentRound.updateMany({
      data: { completedAt: new Date(), status: TournamentRoundStatus.COMPLETED },
      where: { id: roundId, status: TournamentRoundStatus.ONGOING }
    });
    if (count === 0) return;
    const round = await tx.tournamentRound.findUniqueOrThrow({ where: { id: roundId } });
    await this.audit.record(tx, { action: TournamentAuditAction.ROUND_COMPLETED, actorId: null, after: { round: round.number }, tournamentId });
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    const total = await this.totalRounds(tx, t);
    if (t.format === TournamentFormat.KNOCKOUT || total === null) return;
    if (round.number >= total) await this.complete(tx, t, null);
    else await this.planNextRound(tx, t);
  }

  /**
   * Between rounds: (re)writes when the next round starts on its own, from the
   * tournament's round-start settings (`resolveNextRoundAt`). Called when a
   * round completes and when a host edits those settings. Returns the time.
   */
  async planNextRound(tx: Tx, t: Tournament): Promise<Date | null> {
    if (t.format !== TournamentFormat.SWISS && t.format !== TournamentFormat.ROUND_ROBIN) return null;
    const last = await tx.tournamentRound.findFirst({ orderBy: { number: "desc" }, where: { tournamentId: t.id } });
    const total = await this.totalRounds(tx, t);
    if (!last || last.status !== TournamentRoundStatus.COMPLETED || !last.completedAt || total === null || last.number >= total) return null;
    const at = resolveNextRoundAt({
      completedAt: last.completedAt,
      mode: t.roundStartMode,
      nextRound: last.number + 1,
      roundBreakSec: t.roundBreakSec,
      schedule: roundScheduleOf(t)
    });
    await tx.tournament.update({ data: { nextRoundAt: at }, where: { id: t.id } });
    return at;
  }

  async completeArenaIfOver(tx: Tx, t: Tournament) {
    const fresh = await tx.tournament.findUniqueOrThrow({ where: { id: t.id } });
    if (fresh.status !== TournamentStatus.LIVE && fresh.status !== TournamentStatus.PAUSED) return;
    if (!fresh.arenaEndsAt || fresh.arenaEndsAt.getTime() > Date.now()) return;
    const ongoing = await tx.tournamentGame.count({ where: { status: TournamentGameStatus.ONGOING, tournamentId: t.id } });
    if (ongoing === 0) await this.complete(tx, fresh, null);
  }

  /** LIVE / PAUSED → COMPLETED (final standings written). */
  async complete(tx: Tx, t: Tournament, actorId: string | null) {
    const { count } = await tx.tournament.updateMany({
      data: { endedAt: new Date(), status: TournamentStatus.COMPLETED, version: { increment: 1 } },
      where: { id: t.id, status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } }
    });
    if (count === 0) return;
    await this.recomputeStandings(tx, t);
    await this.audit.record(tx, { action: TournamentAuditAction.COMPLETED, actorId, tournamentId: t.id });
  }

  // ── standings ──

  /** Recomputes the standings from the games and rewrites the player cache. Returns the rows. */
  async recomputeStandings(tx: Tx, t: Tournament): Promise<StandingRow[]> {
    const field = await tx.tournamentPlayer.findMany({
      select: { id: true, seedNumber: true, seedRating: true },
      where: { seedNumber: { not: null }, tournamentId: t.id }
    });
    const games = (await tx.tournamentGame.findMany({ where: { status: TournamentGameStatus.FINISHED, tournamentId: t.id } })).map(toGameRecord);
    const arena = tournamentArenaConfigSchema.safeParse(t.arenaConfigJson ?? {});
    const rows = computeStandings({
      arenaConfig: arena.success ? arena.data : undefined,
      format: t.format,
      games,
      players: field.map((p) => ({ id: p.id, rating: p.seedRating, seed: p.seedNumber! })),
      tiebreaks: t.tiebreaks
    });
    // Knockout: rank by how far each player went (champion 1), then seed.
    if (t.format === TournamentFormat.KNOCKOUT) await this.rankKnockout(tx, t, rows);
    const current = await tx.tournamentPlayer.findMany({
      select: { draws: true, id: true, losses: true, onFire: true, performance: true, played: true, points: true, rank: true, streak: true, tiebreaksJson: true, wins: true },
      where: { id: { in: rows.map((r) => r.playerId) } }
    });
    const byId = new Map(current.map((c) => [c.id, c]));
    for (const row of rows) {
      const data = {
        draws: row.draws,
        losses: row.losses,
        onFire: row.onFire,
        performance: row.performance,
        played: row.played,
        points: row.points,
        rank: row.rank,
        streak: row.streak,
        tiebreaksJson: row.tiebreaks as Prisma.InputJsonValue,
        wins: row.wins
      };
      const before = byId.get(row.playerId);
      if (
        before &&
        before.draws === data.draws &&
        before.losses === data.losses &&
        before.onFire === data.onFire &&
        before.performance === data.performance &&
        before.played === data.played &&
        before.points === data.points &&
        before.rank === data.rank &&
        before.streak === data.streak &&
        before.wins === data.wins &&
        stableJson(before.tiebreaksJson) === stableJson(row.tiebreaks)
      ) {
        continue;
      }
      await tx.tournamentPlayer.update({ data, where: { id: row.playerId } });
    }
    return rows;
  }

  private async rankKnockout(tx: Tx, t: Tournament, rows: StandingRow[]) {
    const matches = await tx.tournamentKnockoutMatch.findMany({ where: { tournamentId: t.id } });
    const reached = new Map<string, number>();
    for (const m of matches) {
      for (const id of [m.playerAId, m.playerBId]) if (id) reached.set(id, Math.max(reached.get(id) ?? 0, m.bracketRound));
      if (m.winnerId && m.status === TournamentKnockoutMatchStatus.DECIDED) {
        reached.set(m.winnerId, Math.max(reached.get(m.winnerId) ?? 0, m.bracketRound + 0.5));
      }
    }
    const seedOf = new Map((await tx.tournamentPlayer.findMany({ select: { id: true, seedNumber: true }, where: { tournamentId: t.id } })).map((p) => [p.id, p.seedNumber ?? 0]));
    rows.sort((a, b) => (reached.get(b.playerId) ?? 0) - (reached.get(a.playerId) ?? 0) || (seedOf.get(a.playerId) ?? 0) - (seedOf.get(b.playerId) ?? 0));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && (reached.get(prev.playerId) ?? 0) === (reached.get(row.playerId) ?? 0) ? prev.rank : i + 1;
    });
  }
}

/** JSON with sorted keys (JSONB reorders object keys, so a plain stringify can't compare). */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}
