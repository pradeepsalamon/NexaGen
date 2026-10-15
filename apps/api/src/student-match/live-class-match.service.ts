import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  LiveMatchChallenge,
  LiveMatchChallengeRequest,
  LiveMatchChallengeResponseRequest,
  LiveMatchGame,
  LiveMatchGameActionRequest,
  LiveMatchGameResponse,
  LiveMatchMessage,
  LiveMatchMoveRequest,
  LiveMatchPairRequest,
  LiveMatchPlayer,
  LiveMatchRound,
  LiveMatchStateResponse,
  MatchColor as MatchColorDto,
  MatchMove,
  MatchPair,
  StartLiveMatchRoundRequest,
  UpdateLiveMatchRoundRequest
} from "@nexa-chess/types";
import {
  autoPairPlayers,
  encodeLiveMatch,
  LIVE_CLASS_MATCH_TOPIC,
  MATCH_CLOCK_START_PLY,
  matchPointsFor
} from "@nexa-chess/types";
import {
  LiveSessionStatus,
  MatchChallengeStatus,
  MatchColor,
  MatchEndReason,
  MatchGameResult,
  MatchGameStatus,
  MatchPairingMode,
  Prisma,
  UserRole,
  UserStatus
} from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { GameRecorderService } from "../game-library/game-recorder.service";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";
import { normalizeEngineFen } from "../stockfish/stockfish.service";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CONNECTED_CACHE_MS = 3000;

const nameSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const gameInclude = {
  black: nameSelect,
  round: { select: { clockIncrementMs: true, id: true, liveClassId: true, startFen: true, status: true } },
  white: nameSelect
} satisfies Prisma.LiveClassMatchGameInclude;

type GameRow = Prisma.LiveClassMatchGameGetPayload<{ include: typeof gameInclude }>;
type RoundRef = GameRow["round"];

const roundInclude = {
  challenges: {
    include: { from: nameSelect, to: nameSelect },
    orderBy: { createdAt: "asc" },
    where: { status: MatchChallengeStatus.PENDING }
  },
  games: { include: { black: nameSelect, white: nameSelect }, orderBy: { createdAt: "asc" } }
} satisfies Prisma.LiveClassMatchRoundInclude;

type RoundRow = Prisma.LiveClassMatchRoundGetPayload<{ include: typeof roundInclude }>;

type Outcome = { result: MatchGameResult | null; endReason: MatchEndReason };
type Actor = { id: string; role: UserRole };
type Eligible = Map<string, { name: string; inClass: boolean }>;
type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

@Injectable()
export class LiveClassMatchService {
  private readonly connectedCache = new Map<string, { at: number; ids: Set<string> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService,
    private readonly gameRecorder: GameRecorderService
  ) {}

  // ── round lifecycle (coach-owner / admin) ──

  /** Starts a round (ending any running one) and creates its first pairings. */
  async start(
    accessToken: string | undefined,
    classId: string,
    dto: StartLiveMatchRoundRequest
  ): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const startFen = this.resolveStartFen(dto.startFen);
    const eligible = await this.loadEligible(classId, liveSession.roomName);

    let pairs: MatchPair[] = [];
    if (dto.pairingMode === "AUTO") {
      const ids = dto.studentIds ?? [...eligible].filter(([, s]) => s.inClass).map(([id]) => id);
      this.assertEligible(ids, eligible);
      pairs = autoPairPlayers([...new Set(ids)].map((id) => ({ id, points: 0 }))).pairs;
      if (pairs.length === 0) throw new BadRequestException("At least two students are needed to pair.");
    } else if (dto.pairingMode === "COACH") {
      pairs = dto.pairs ?? [];
      if (pairs.length === 0) throw new BadRequestException("Add at least one pair.");
      this.assertPairs(pairs, eligible, new Set());
    }

    const clockInitialMs = dto.timeControl ? dto.timeControl.initialSeconds * 1000 : null;
    const clockIncrementMs = dto.timeControl ? dto.timeControl.incrementSeconds * 1000 : 0;

    let created: RoundRow;
    let replacedRoundId: string | null = null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        replacedRoundId = await this.closeActive(tx, classId);
        return tx.liveClassMatchRound.create({
          data: {
            clockIncrementMs,
            clockInitialMs,
            games: { create: pairs.map((p) => this.newGameData(p, startFen, clockInitialMs)) },
            liveClassId: classId,
            pairingMode: dto.pairingMode,
            startFen,
            startedById: user.id
          },
          include: roundInclude
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A match round was just started in this class.");
      }
      throw error;
    }

    if (replacedRoundId) this.gameRecorder.recordMatchRoundInBackground(replacedRoundId);
    await this.broadcast(liveSession.roomName, { type: "ROUND_CHANGED", roundId: created.id });
    return { round: this.toRound(created, eligible, user) };
  }

  /** Switches how the running round pairs players (e.g. let students choose). */
  async update(
    accessToken: string | undefined,
    classId: string,
    dto: UpdateLiveMatchRoundRequest
  ): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const round = await this.findActive(classId);
    await this.prisma.$transaction(async (tx) => {
      await tx.liveClassMatchRound.update({ where: { id: round.id }, data: { pairingMode: dto.pairingMode } });
      if (dto.pairingMode !== MatchPairingMode.STUDENT_CHOICE) {
        await this.cancelPendingChallenges(tx, round.id);
      }
    });
    await this.broadcast(liveSession.roomName, { type: "ROUND_CHANGED", roundId: round.id });
    return this.stateFor(user, classId, liveSession.roomName);
  }

  /** Ends the running round; unfinished games stay unscored. */
  async end(accessToken: string | undefined, classId: string): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const roundId = await this.prisma.$transaction((tx) => this.closeActive(tx, classId));
    if (roundId) this.gameRecorder.recordMatchRoundInBackground(roundId);
    if (roundId) await this.broadcast(liveSession.roomName, { type: "ROUND_ENDED", roundId });
    return this.stateFor(user, classId, liveSession.roomName);
  }

  /** Pairs more students into the running round — automatically or by hand. */
  async pair(
    accessToken: string | undefined,
    classId: string,
    dto: LiveMatchPairRequest
  ): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const round = await this.findActive(classId);
    const eligible = await this.loadEligible(classId, liveSession.roomName);

    const createdCount = await this.prisma.$transaction(async (tx) => {
      await this.lockRound(tx, round.id);
      const games = await tx.liveClassMatchGame.findMany({ where: { roundId: round.id } });
      const busy = new Set(
        games.filter((g) => g.status === MatchGameStatus.ONGOING).flatMap((g) => [g.whiteId, g.blackId])
      );

      let pairs: MatchPair[];
      if (dto.type === "AUTO") {
        const ids = (dto.studentIds ?? [...eligible].filter(([, s]) => s.inClass).map(([id]) => id)).filter(
          (id) => !busy.has(id)
        );
        this.assertEligible(ids, eligible);
        const points = this.pointsByStudent(games);
        pairs = autoPairPlayers(
          [...new Set(ids)].map((id) => ({ id, points: points.get(id) ?? 0 })),
          games.map((g) => ({ blackId: g.blackId, whiteId: g.whiteId }))
        ).pairs;
        if (pairs.length === 0) throw new BadRequestException("At least two free students are needed to pair.");
      } else {
        pairs = dto.pairs;
        this.assertPairs(pairs, eligible, busy);
      }

      for (const p of pairs) {
        await tx.liveClassMatchGame.create({
          data: { ...this.newGameData(p, round.startFen, round.clockInitialMs), roundId: round.id }
        });
      }
      await this.cancelPendingChallenges(
        tx,
        round.id,
        pairs.flatMap((p) => [p.whiteId, p.blackId])
      );
      return pairs.length;
    });

    if (createdCount > 0) {
      await this.broadcast(liveSession.roomName, { type: "ROUND_CHANGED", roundId: round.id });
    }
    return this.stateFor(user, classId, liveSession.roomName);
  }

  /** Any participant: the running (or most recent) round, filtered for students. */
  async getCurrent(accessToken: string | undefined, classId: string): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    return this.stateFor(user, classId, liveSession.roomName);
  }

  // ── challenges (students-choose rounds) ──

  /** A student challenges a classmate; a crossing challenge is accepted on the spot. */
  async challenge(
    accessToken: string | undefined,
    classId: string,
    dto: LiveMatchChallengeRequest
  ): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.resolveLiveParticipant(accessToken, classId);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students can send challenges.");
    if (dto.opponentId === user.id) throw new BadRequestException("You cannot challenge yourself.");

    const round = await this.findActive(classId);
    if (round.pairingMode !== MatchPairingMode.STUDENT_CHOICE) {
      throw new BadRequestException("Your coach is doing the pairing in this round.");
    }
    const eligible = await this.loadEligible(classId, liveSession.roomName);
    if (!eligible.get(dto.opponentId)?.inClass) {
      throw new BadRequestException("That student is not in class right now.");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRound(tx, round.id);
        await this.assertFree(tx, round.id, [user.id, dto.opponentId]);
        const crossing = await tx.liveClassMatchChallenge.findFirst({
          where: { fromId: dto.opponentId, roundId: round.id, status: MatchChallengeStatus.PENDING, toId: user.id }
        });
        if (crossing) {
          await this.acceptInTx(tx, round, crossing.id, crossing.fromId, crossing.toId);
          return;
        }
        await tx.liveClassMatchChallenge.create({
          data: { fromId: user.id, roundId: round.id, toId: dto.opponentId }
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You have already challenged that student.");
      }
      throw error;
    }

    await this.broadcast(liveSession.roomName, { type: "ROUND_CHANGED", roundId: round.id });
    return this.stateFor(user, classId, liveSession.roomName);
  }

  /** The opponent accepts / declines, or the challenger cancels. */
  async respondToChallenge(
    accessToken: string | undefined,
    classId: string,
    challengeId: string,
    dto: LiveMatchChallengeResponseRequest
  ): Promise<LiveMatchStateResponse> {
    const { user, liveSession } = await this.resolveLiveParticipant(accessToken, classId);
    const challenge = await this.prisma.liveClassMatchChallenge.findUnique({
      where: { id: challengeId },
      include: { round: true }
    });
    if (!challenge || challenge.round.liveClassId !== classId) throw new NotFoundException("Challenge not found.");
    if (challenge.round.status !== "ACTIVE") throw new BadRequestException("This round has ended.");
    if (challenge.status !== MatchChallengeStatus.PENDING) {
      throw new ConflictException("That challenge is no longer open.");
    }
    const mine = dto.action === "CANCEL" ? challenge.fromId : challenge.toId;
    if (mine !== user.id) throw new ForbiddenException("This is not your challenge to answer.");

    if (dto.action === "ACCEPT") {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRound(tx, challenge.roundId);
        await this.assertFree(tx, challenge.roundId, [challenge.fromId, challenge.toId]);
        await this.acceptInTx(tx, challenge.round, challenge.id, challenge.fromId, challenge.toId);
      });
    } else {
      const updated = await this.prisma.liveClassMatchChallenge.updateMany({
        data: {
          resolvedAt: new Date(),
          status: dto.action === "DECLINE" ? MatchChallengeStatus.DECLINED : MatchChallengeStatus.CANCELLED
        },
        where: { id: challenge.id, status: MatchChallengeStatus.PENDING }
      });
      if (updated.count === 0) throw new ConflictException("That challenge is no longer open.");
    }

    await this.broadcast(liveSession.roomName, { type: "ROUND_CHANGED", roundId: challenge.roundId });
    return this.stateFor(user, classId, liveSession.roomName);
  }

  // ── play ──

  async move(
    accessToken: string | undefined,
    classId: string,
    gameId: string,
    dto: LiveMatchMoveRequest
  ): Promise<LiveMatchGameResponse> {
    const { game, color, roomName } = await this.resolvePlayer(accessToken, classId, gameId);
    if (!color) throw new ForbiddenException("Only the two players can move.");
    if (game.status !== MatchGameStatus.ONGOING) throw new BadRequestException("This game is over.");
    if (game.ply !== dto.ply) throw new ConflictException("The board changed — refresh and try again.");
    if (this.turnOf(game) !== color) throw new BadRequestException("It is not your move.");

    const now = new Date();
    const left = this.remainingFor(game, color, now);
    if (left !== null && left <= 0) {
      return this.finishGame(roomName, game, this.timeoutOutcome(game, color), now);
    }

    const chess = this.replay(game);
    let played;
    try {
      played = chess.move({
        from: dto.uci.slice(0, 2),
        promotion: dto.uci.slice(4) || undefined,
        to: dto.uci.slice(2, 4)
      });
    } catch {
      played = null;
    }
    if (!played) throw new BadRequestException("That move is not legal.");

    const move: MatchMove = { san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` };
    const clockField = color === "white" ? "whiteClockMs" : "blackClockMs";
    const clockUpdate =
      left === null
        ? {}
        : { [clockField]: left + (game.ply >= MATCH_CLOCK_START_PLY ? game.round.clockIncrementMs : 0) };
    const outcome = this.outcomeAfter(chess, color);

    const updated = await this.prisma.liveClassMatchGame.updateMany({
      data: {
        ...clockUpdate,
        drawOfferedBy: null,
        fen: chess.fen(),
        movesJson: [...this.movesOf(game.movesJson), move] as unknown as Prisma.InputJsonValue,
        ply: game.ply + 1,
        turnSince: now,
        ...(outcome ? this.finishData(outcome, now) : {})
      },
      where: { id: game.id, ply: game.ply, status: MatchGameStatus.ONGOING }
    });
    if (updated.count === 0) throw new ConflictException("The board changed — refresh and try again.");
    return this.publishGame(roomName, game.id);
  }

  /** Resign, draw offers, timeout claims; the coach can also decide or abort a game. */
  async action(
    accessToken: string | undefined,
    classId: string,
    gameId: string,
    dto: LiveMatchGameActionRequest
  ): Promise<LiveMatchGameResponse> {
    const { game, color, roomName } = await this.resolvePlayer(accessToken, classId, gameId);
    if (game.status !== MatchGameStatus.ONGOING) throw new BadRequestException("This game is over.");
    const now = new Date();

    if (dto.action === "ADJUDICATE" || dto.action === "ABORT") {
      if (color) throw new ForbiddenException("Only the coach can decide a game.");
      return this.finishGame(
        roomName,
        game,
        dto.action === "ABORT"
          ? { endReason: MatchEndReason.ABORTED, result: null }
          : { endReason: MatchEndReason.ADJUDICATED, result: dto.result },
        now
      );
    }

    if (dto.action === "CLAIM_TIMEOUT") {
      const toMove = this.turnOf(game)!;
      const left = this.remainingFor(game, toMove, now);
      if (left === null || left > 0) throw new BadRequestException("Time has not run out.");
      return this.finishGame(roomName, game, this.timeoutOutcome(game, toMove), now);
    }

    if (!color) throw new ForbiddenException("Only the two players can do that.");
    const mine = color === "white" ? MatchColor.WHITE : MatchColor.BLACK;
    const theirs = color === "white" ? MatchColor.BLACK : MatchColor.WHITE;

    switch (dto.action) {
      case "RESIGN":
        return this.finishGame(
          roomName,
          game,
          {
            endReason: MatchEndReason.RESIGNATION,
            result: color === "white" ? MatchGameResult.BLACK_WON : MatchGameResult.WHITE_WON
          },
          now
        );
      case "OFFER_DRAW":
        if (game.drawOfferedBy === theirs) {
          return this.finishGame(roomName, game, { endReason: MatchEndReason.DRAW_AGREED, result: MatchGameResult.DRAW }, now);
        }
        return this.patchGame(roomName, game, { drawOfferedBy: mine });
      case "ACCEPT_DRAW":
        if (game.drawOfferedBy !== theirs) throw new BadRequestException("There is no draw offer to accept.");
        return this.finishGame(roomName, game, { endReason: MatchEndReason.DRAW_AGREED, result: MatchGameResult.DRAW }, now);
      case "DECLINE_DRAW":
        if (game.drawOfferedBy !== theirs) throw new BadRequestException("There is no draw offer to decline.");
        return this.patchGame(roomName, game, { drawOfferedBy: null });
    }
  }

  // ── internals ──

  private async resolveLiveParticipant(accessToken: string | undefined, classId: string) {
    const resolved = await this.liveClass.resolveParticipant(accessToken, classId);
    if (resolved.liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }
    return resolved;
  }

  /** `color` is the caller's side, or null for the coach / an admin watching. */
  private async resolvePlayer(accessToken: string | undefined, classId: string, gameId: string) {
    const { user, liveSession } = await this.resolveLiveParticipant(accessToken, classId);
    const game = await this.prisma.liveClassMatchGame.findUnique({ include: gameInclude, where: { id: gameId } });
    if (!game || game.round.liveClassId !== classId) throw new NotFoundException("Game not found.");
    if (game.round.status !== "ACTIVE") throw new BadRequestException("This round has ended.");

    let color: MatchColorDto | null;
    if (user.id === game.whiteId) color = "white";
    else if (user.id === game.blackId) color = "black";
    // resolveParticipant already limited coaches to the class owner.
    else if (user.role !== UserRole.STUDENT) color = null;
    else throw new ForbiddenException("This is not your game.");

    return { color, game, roomName: liveSession.roomName };
  }

  private async findActive(classId: string) {
    const round = await this.prisma.liveClassMatchRound.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" }
    });
    if (!round) throw new NotFoundException("No match round is running in this class.");
    return round;
  }

  /** Serializes pairing / challenge writes for one round. */
  private async lockRound(tx: PrismaTx, roundId: string) {
    await tx.$queryRaw`SELECT "id" FROM "live_class_match_rounds" WHERE "id" = ${roundId} FOR UPDATE`;
  }

  private async assertFree(tx: PrismaTx, roundId: string, studentIds: string[]) {
    const busy = await tx.liveClassMatchGame.findFirst({
      where: {
        OR: [{ whiteId: { in: studentIds } }, { blackId: { in: studentIds } }],
        roundId,
        status: MatchGameStatus.ONGOING
      }
    });
    if (busy) throw new ConflictException("One of you is already playing a game.");
  }

  private async acceptInTx(
    tx: PrismaTx,
    round: { id: string; startFen: string; clockInitialMs: number | null },
    challengeId: string,
    fromId: string,
    toId: string
  ) {
    const pair = Math.random() < 0.5 ? { blackId: toId, whiteId: fromId } : { blackId: fromId, whiteId: toId };
    await tx.liveClassMatchChallenge.update({
      data: { resolvedAt: new Date(), status: MatchChallengeStatus.ACCEPTED },
      where: { id: challengeId }
    });
    await tx.liveClassMatchGame.create({
      data: { ...this.newGameData(pair, round.startFen, round.clockInitialMs), roundId: round.id }
    });
    await this.cancelPendingChallenges(tx, round.id, [fromId, toId]);
  }

  private async cancelPendingChallenges(tx: PrismaTx, roundId: string, studentIds?: string[]) {
    await tx.liveClassMatchChallenge.updateMany({
      data: { resolvedAt: new Date(), status: MatchChallengeStatus.CANCELLED },
      where: {
        roundId,
        status: MatchChallengeStatus.PENDING,
        ...(studentIds ? { OR: [{ fromId: { in: studentIds } }, { toId: { in: studentIds } }] } : {})
      }
    });
  }

  private newGameData(pair: MatchPair, startFen: string, clockInitialMs: number | null) {
    return {
      blackClockMs: clockInitialMs,
      blackId: pair.blackId,
      fen: startFen,
      whiteClockMs: clockInitialMs,
      whiteId: pair.whiteId
    };
  }

  private assertEligible(ids: string[], eligible: Eligible) {
    if (ids.some((id) => !eligible.has(id))) {
      throw new BadRequestException("Every player must be a student in this class.");
    }
  }

  private assertPairs(pairs: MatchPair[], eligible: Eligible, busy: Set<string>) {
    const ids = pairs.flatMap((p) => [p.whiteId, p.blackId]);
    this.assertEligible(ids, eligible);
    if (new Set(ids).size !== ids.length) throw new BadRequestException("A student can only be in one pair.");
    if (ids.some((id) => busy.has(id))) throw new ConflictException("A student in those pairs is already playing.");
  }

  private async closeActive(tx: PrismaTx, classId: string): Promise<string | null> {
    const active = await tx.liveClassMatchRound.findFirst({
      select: { id: true },
      where: { liveClassId: classId, status: "ACTIVE" }
    });
    if (!active) return null;
    const now = new Date();
    await tx.liveClassMatchGame.updateMany({
      data: { drawOfferedBy: null, endReason: MatchEndReason.ROUND_ENDED, finishedAt: now, status: MatchGameStatus.FINISHED },
      where: { roundId: active.id, status: MatchGameStatus.ONGOING }
    });
    await this.cancelPendingChallenges(tx, active.id);
    await tx.liveClassMatchRound.update({ data: { endedAt: now, status: "ENDED" }, where: { id: active.id } });
    return active.id;
  }

  private async finishGame(
    roomName: string,
    game: GameRow,
    outcome: Outcome,
    now: Date
  ): Promise<LiveMatchGameResponse> {
    const toMove = this.turnOf(game);
    const left = toMove ? this.remainingFor(game, toMove, now) : null;
    return this.patchGame(roomName, game, {
      ...this.finishData(outcome, now),
      ...(toMove && left !== null ? { [toMove === "white" ? "whiteClockMs" : "blackClockMs"]: Math.max(0, left) } : {})
    });
  }

  private async patchGame(
    roomName: string,
    game: GameRow,
    data: Prisma.LiveClassMatchGameUpdateManyMutationInput
  ): Promise<LiveMatchGameResponse> {
    const updated = await this.prisma.liveClassMatchGame.updateMany({
      data,
      where: { id: game.id, ply: game.ply, status: MatchGameStatus.ONGOING }
    });
    if (updated.count === 0) throw new ConflictException("The game changed — refresh and try again.");
    return this.publishGame(roomName, game.id);
  }

  private finishData(outcome: Outcome, at: Date): Prisma.LiveClassMatchGameUpdateManyMutationInput {
    return {
      drawOfferedBy: null,
      endReason: outcome.endReason,
      finishedAt: at,
      result: outcome.result,
      status: MatchGameStatus.FINISHED
    };
  }

  private async publishGame(roomName: string, gameId: string): Promise<LiveMatchGameResponse> {
    const row = await this.prisma.liveClassMatchGame.findUniqueOrThrow({ include: gameInclude, where: { id: gameId } });
    const game = this.toGame(row, row.round);
    this.gameRecorder.recordMatchGameInBackground(gameId);
    await this.broadcast(roomName, { game, type: "MATCH_GAME" });
    return { game };
  }

  /** Remaining ms for `color` right now, or null for an untimed game. */
  private remainingFor(
    game: Pick<GameRow, "whiteClockMs" | "blackClockMs" | "ply" | "turnSince" | "fen" | "status">,
    color: MatchColorDto,
    now: Date
  ): number | null {
    const base = color === "white" ? game.whiteClockMs : game.blackClockMs;
    if (base === null) return null;
    if (game.ply < MATCH_CLOCK_START_PLY || this.turnOf(game) !== color) return base;
    return base - (now.getTime() - game.turnSince.getTime());
  }

  /** The flagged side loses — unless the other side has no mating material. */
  private timeoutOutcome(game: GameRow, flagged: MatchColorDto): Outcome {
    const winner: MatchColorDto = flagged === "white" ? "black" : "white";
    if (!this.hasMatingMaterial(game.fen, winner)) {
      return { endReason: MatchEndReason.TIMEOUT, result: MatchGameResult.DRAW };
    }
    return {
      endReason: MatchEndReason.TIMEOUT,
      result: winner === "white" ? MatchGameResult.WHITE_WON : MatchGameResult.BLACK_WON
    };
  }

  private hasMatingMaterial(fen: string, color: MatchColorDto): boolean {
    const board = fen.split(" ")[0];
    const pieces = color === "white" ? board.replace(/[^A-Z]/g, "") : board.replace(/[^a-z]/g, "").toUpperCase();
    if (/[PRQ]/.test(pieces)) return true;
    return pieces.replace(/K/g, "").length >= 2;
  }

  /** Rebuilt from the start so threefold repetition sees the whole game. */
  private replay(game: GameRow): Chess {
    try {
      const chess = new Chess(game.round.startFen);
      for (const m of this.movesOf(game.movesJson)) {
        chess.move({ from: m.uci.slice(0, 2), promotion: m.uci.slice(4) || undefined, to: m.uci.slice(2, 4) });
      }
      if (chess.fen() === game.fen) return chess;
    } catch {
      // Fall through to the stored position.
    }
    return new Chess(game.fen);
  }

  private outcomeAfter(chess: Chess, mover: MatchColorDto): Outcome | null {
    if (chess.isCheckmate()) {
      return {
        endReason: MatchEndReason.CHECKMATE,
        result: mover === "white" ? MatchGameResult.WHITE_WON : MatchGameResult.BLACK_WON
      };
    }
    const draw = (endReason: MatchEndReason): Outcome => ({ endReason, result: MatchGameResult.DRAW });
    if (chess.isStalemate()) return draw(MatchEndReason.STALEMATE);
    if (chess.isInsufficientMaterial()) return draw(MatchEndReason.INSUFFICIENT_MATERIAL);
    if (chess.isThreefoldRepetition()) return draw(MatchEndReason.THREEFOLD_REPETITION);
    if (chess.isDraw()) return draw(MatchEndReason.FIFTY_MOVE_RULE);
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

  private turnOf(game: { status: MatchGameStatus; fen: string }): MatchColorDto | null {
    if (game.status !== MatchGameStatus.ONGOING) return null;
    return game.fen.split(" ")[1] === "b" ? "black" : "white";
  }

  private movesOf(value: Prisma.JsonValue): MatchMove[] {
    return Array.isArray(value) ? (value as unknown as MatchMove[]) : [];
  }

  private pointsByStudent(
    games: { whiteId: string; blackId: string; result: MatchGameResult | null }[]
  ): Map<string, number> {
    const points = new Map<string, number>();
    for (const g of games) {
      const ref = { black: { id: g.blackId, name: "" }, result: g.result, white: { id: g.whiteId, name: "" } };
      for (const id of [g.whiteId, g.blackId]) {
        const p = matchPointsFor(ref, id);
        if (p !== null) points.set(id, (points.get(id) ?? 0) + p);
      }
    }
    return points;
  }

  /** Students who may be paired: the batch roster plus every student connected to the room. */
  private async loadEligible(classId: string, roomName: string): Promise<Eligible> {
    const [liveSession, connected] = await Promise.all([
      this.prisma.liveSession.findUnique({
        include: { batch: { include: { students: { select: { studentId: true }, where: { isDeleted: false } } } } },
        where: { classId }
      }),
      this.connectedIds(roomName)
    ]);
    const ids = new Set([...(liveSession?.batch?.students ?? []).map((s) => s.studentId), ...connected]);
    const users = await this.prisma.user.findMany({
      select: { firstName: true, id: true, lastName: true },
      where: { id: { in: [...ids] }, role: UserRole.STUDENT, status: UserStatus.ACTIVE }
    });
    return new Map(users.map((u) => [u.id, { inClass: connected.has(u.id), name: fullName(u) ?? "Student" }]));
  }

  private async connectedIds(roomName: string): Promise<Set<string>> {
    const cached = this.connectedCache.get(roomName);
    if (cached && Date.now() - cached.at < CONNECTED_CACHE_MS) return cached.ids;
    const ids = await this.liveClass.connectedUserIds(roomName);
    this.connectedCache.set(roomName, { at: Date.now(), ids });
    if (this.connectedCache.size > 200) this.connectedCache.clear();
    return ids;
  }

  private async stateFor(user: Actor, classId: string, roomName: string): Promise<LiveMatchStateResponse> {
    const row =
      (await this.prisma.liveClassMatchRound.findFirst({
        include: roundInclude,
        where: { liveClassId: classId, status: "ACTIVE" }
      })) ??
      (await this.prisma.liveClassMatchRound.findFirst({
        include: roundInclude,
        orderBy: { startedAt: "desc" },
        where: { liveClassId: classId }
      }));
    if (!row) return { round: null };
    const eligible = row.status === "ACTIVE" ? await this.loadEligible(classId, roomName) : new Map();
    return { round: this.toRound(row, eligible, user) };
  }

  private toRound(row: RoundRow, eligible: Eligible, viewer: Actor): LiveMatchRound {
    const games = row.games.map((g) => this.toGame(g, row));
    const challenges: LiveMatchChallenge[] = row.challenges.map((c) => ({
      createdAt: c.createdAt.toISOString(),
      from: { id: c.fromId, name: fullName(c.from) ?? "Student" },
      id: c.id,
      status: c.status,
      to: { id: c.toId, name: fullName(c.to) ?? "Student" }
    }));

    const players = new Map<string, LiveMatchPlayer>();
    const ensure = (id: string, name: string) => {
      if (!players.has(id)) {
        players.set(id, {
          gameId: null,
          inClass: eligible.get(id)?.inClass ?? false,
          name,
          played: 0,
          points: 0,
          studentId: id
        });
      }
      return players.get(id)!;
    };
    for (const [id, s] of eligible) if (s.inClass) ensure(id, s.name);
    for (const g of games) {
      for (const ref of [g.white, g.black]) {
        const player = ensure(ref.id, ref.name);
        if (g.status === "ONGOING") player.gameId = g.id;
        const points = matchPointsFor(g, ref.id);
        if (points !== null) {
          player.played += 1;
          player.points += points;
        }
      }
    }

    const isStudent = viewer.role === UserRole.STUDENT;
    return {
      challenges: isStudent ? challenges.filter((c) => c.from.id === viewer.id || c.to.id === viewer.id) : challenges,
      endedAt: row.endedAt?.toISOString() ?? null,
      games: isStudent ? games.filter((g) => g.white.id === viewer.id || g.black.id === viewer.id) : games,
      id: row.id,
      pairingMode: row.pairingMode,
      players: [...players.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
      startFen: row.startFen,
      startedAt: row.startedAt.toISOString(),
      status: row.status,
      timeControl:
        row.clockInitialMs === null
          ? null
          : { incrementSeconds: row.clockIncrementMs / 1000, initialSeconds: row.clockInitialMs / 1000 }
    };
  }

  private toGame(
    row: Omit<GameRow, "round">,
    round: Pick<RoundRef, "startFen" | "clockIncrementMs">
  ): LiveMatchGame {
    const color = (c: MatchColor | null): MatchColorDto | null =>
      c === MatchColor.WHITE ? "white" : c === MatchColor.BLACK ? "black" : null;
    return {
      black: { id: row.blackId, name: fullName(row.black) ?? "Student" },
      blackClockMs: row.blackClockMs,
      drawOfferedBy: color(row.drawOfferedBy),
      endReason: row.endReason,
      fen: row.fen,
      id: row.id,
      incrementMs: round.clockIncrementMs,
      moves: this.movesOf(row.movesJson),
      ply: row.ply,
      result: row.result,
      roundId: row.roundId,
      serverTime: new Date().toISOString(),
      startFen: round.startFen,
      status: row.status,
      turn: this.turnOf(row),
      turnSince: row.turnSince.toISOString(),
      white: { id: row.whiteId, name: fullName(row.white) ?? "Student" },
      whiteClockMs: row.whiteClockMs
    };
  }

  private async broadcast(roomName: string, message: LiveMatchMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(roomName, encodeLiveMatch(message), LIVE_CLASS_MATCH_TOPIC);
    } catch {
      // Nudge only — REST is authoritative and clients refetch on reconnect.
    }
  }
}
