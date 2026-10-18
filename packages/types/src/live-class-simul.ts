import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Live-class simul — shared contract
// ──────────────────────────────────────────────────────────────
// The coach plays one game against each of several students at once. Every
// move goes through REST (server-validated with chess.js, guarded by `ply`);
// the `live_class_simul` data-channel topic is a server-injected nudge so the
// boards update without polling.

export const LIVE_CLASS_SIMUL_TOPIC = "live_class_simul";

export const SIMUL_MAX_PLAYERS = 40;

export const simulColorModeSchema = z.enum(["WHITE", "BLACK", "ALTERNATE"]);
export type SimulColorMode = z.infer<typeof simulColorModeSchema>;

export const simulSideSchema = z.enum(["COACH", "STUDENT"]);
export type SimulSide = z.infer<typeof simulSideSchema>;

export const simulGameStatusSchema = z.enum(["ONGOING", "FINISHED"]);
export type SimulGameStatus = z.infer<typeof simulGameStatusSchema>;

export const simulGameResultSchema = z.enum(["COACH_WON", "STUDENT_WON", "DRAW"]);
export type SimulGameResult = z.infer<typeof simulGameResultSchema>;

export const simulEndReasonSchema = z.enum([
  "CHECKMATE",
  "STALEMATE",
  "INSUFFICIENT_MATERIAL",
  "THREEFOLD_REPETITION",
  "FIFTY_MOVE_RULE",
  "RESIGNATION",
  "DRAW_AGREED",
  "ADJUDICATED",
  "SIMUL_ENDED"
]);
export type SimulEndReason = z.infer<typeof simulEndReasonSchema>;

export const simulMoveSchema = z.object({
  san: z.string(),
  uci: z.string(),
  by: simulSideSchema,
  /** The coach played the engine's move. */
  engine: z.boolean().optional()
});
export type SimulMove = z.infer<typeof simulMoveSchema>;

export const liveSimulGameSchema = z.object({
  id: z.string(),
  simulId: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  coachColor: z.enum(["white", "black"]),
  fen: z.string(),
  moves: z.array(simulMoveSchema),
  /** Half-moves played; every move request must echo it. */
  ply: z.number().int().min(0),
  /** Whose move it is; null once the game is over. */
  turn: simulSideSchema.nullable(),
  /** ISO time the side to move got the move — the coach's queue sorts on it. */
  turnSince: z.string(),
  status: simulGameStatusSchema,
  /** null on a game cut short by the simul ending. */
  result: simulGameResultSchema.nullable(),
  endReason: simulEndReasonSchema.nullable(),
  drawOfferedBy: simulSideSchema.nullable(),
  engineMoves: z.number().int().min(0)
});
export type LiveSimulGame = z.infer<typeof liveSimulGameSchema>;

export type LiveSimul = {
  id: string;
  status: "ACTIVE" | "ENDED";
  colorMode: SimulColorMode;
  startFen: string;
  startedAt: string;
  endedAt: string | null;
  /** Coach/admin: every game. A student: only their own (or none). */
  games: LiveSimulGame[];
};

export type LiveSimulStateResponse = {
  simul: LiveSimul | null;
};

export type LiveSimulGameResponse = {
  game: LiveSimulGame;
};

// ── Data-channel message ──

export const liveSimulMessageSchema = z.discriminatedUnion("type", [
  // Refetch the simul (started, player added, ended).
  z.object({ type: z.literal("SIMUL_CHANGED"), simulId: z.string() }),
  z.object({ type: z.literal("SIMUL_ENDED"), simulId: z.string() }),
  z.object({ type: z.literal("SIMUL_GAME"), game: liveSimulGameSchema })
]);
export type LiveSimulMessage = z.infer<typeof liveSimulMessageSchema>;

export function encodeLiveSimul(msg: LiveSimulMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeLiveSimul(payload: Uint8Array): LiveSimulMessage | null {
  try {
    const parsed = liveSimulMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Requests ──

export const startLiveSimulRequestSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(SIMUL_MAX_PLAYERS),
  colorMode: simulColorModeSchema.default("WHITE"),
  /** Omitted = the standard starting position. */
  startFen: z.string().max(120).optional()
});
export type StartLiveSimulRequest = z.input<typeof startLiveSimulRequestSchema>;

export const addLiveSimulPlayerRequestSchema = z.object({
  studentId: z.string().min(1)
});
export type AddLiveSimulPlayerRequest = z.infer<typeof addLiveSimulPlayerRequestSchema>;

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a UCI move.");

export const liveSimulMoveRequestSchema = z.object({
  uci: uciSchema,
  ply: z.number().int().min(0)
});
export type LiveSimulMoveRequest = z.infer<typeof liveSimulMoveRequestSchema>;

export const liveSimulEngineMoveRequestSchema = z.object({
  ply: z.number().int().min(0),
  /** Stockfish Skill Level 0-20; omitted = full strength. */
  skillLevel: z.number().int().min(0).max(20).optional()
});
export type LiveSimulEngineMoveRequest = z.infer<typeof liveSimulEngineMoveRequestSchema>;

export const liveSimulGameActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RESIGN") }),
  z.object({ action: z.literal("OFFER_DRAW") }),
  z.object({ action: z.literal("ACCEPT_DRAW") }),
  z.object({ action: z.literal("DECLINE_DRAW") }),
  // Coach only: settle the game by hand.
  z.object({ action: z.literal("ADJUDICATE"), result: simulGameResultSchema })
]);
export type LiveSimulGameActionRequest = z.infer<typeof liveSimulGameActionRequestSchema>;

// ── Helpers shared by the API and both views ──

export const SIMUL_END_REASON_LABELS: Record<SimulEndReason, string> = {
  CHECKMATE: "Checkmate",
  STALEMATE: "Stalemate",
  INSUFFICIENT_MATERIAL: "Insufficient material",
  THREEFOLD_REPETITION: "Threefold repetition",
  FIFTY_MOVE_RULE: "50-move rule",
  RESIGNATION: "Resignation",
  DRAW_AGREED: "Draw agreed",
  ADJUDICATED: "Decided by the coach",
  SIMUL_ENDED: "Simul ended"
};

/** "1-0" / "0-1" / "½-½" in board terms, or "*" for an unfinished game. */
export function simulScoreLabel(game: Pick<LiveSimulGame, "coachColor" | "result">): string {
  if (!game.result) return "*";
  if (game.result === "DRAW") return "½-½";
  const whiteWon = (game.result === "COACH_WON") === (game.coachColor === "white");
  return whiteWon ? "1-0" : "0-1";
}

/**
 * The coach's queue order: boards waiting on the coach first (longest wait
 * first), then boards waiting on a student, then finished ones.
 */
export function compareSimulGamesForCoach(a: LiveSimulGame, b: LiveSimulGame): number {
  const bucket = (g: LiveSimulGame) => (g.turn === "COACH" ? 0 : g.turn === "STUDENT" ? 1 : 2);
  const diff = bucket(a) - bucket(b);
  if (diff !== 0) return diff;
  if (a.turn === "COACH") {
    const wait = a.turnSince.localeCompare(b.turnSince);
    if (wait !== 0) return wait;
  }
  return a.studentName.localeCompare(b.studentName);
}

export type SimulTally = {
  coachWins: number;
  studentWins: number;
  draws: number;
  ongoing: number;
  coachToMove: number;
  /** Coach's score out of finished decided games, e.g. 3.5. */
  coachPoints: number;
};

export function tallySimul(games: LiveSimulGame[]): SimulTally {
  const tally: SimulTally = {
    coachWins: 0,
    studentWins: 0,
    draws: 0,
    ongoing: 0,
    coachToMove: 0,
    coachPoints: 0
  };
  for (const game of games) {
    if (game.status === "ONGOING") {
      tally.ongoing += 1;
      if (game.turn === "COACH") tally.coachToMove += 1;
    } else if (game.result === "COACH_WON") {
      tally.coachWins += 1;
      tally.coachPoints += 1;
    } else if (game.result === "STUDENT_WON") {
      tally.studentWins += 1;
    } else if (game.result === "DRAW") {
      tally.draws += 1;
      tally.coachPoints += 0.5;
    }
  }
  return tally;
}
