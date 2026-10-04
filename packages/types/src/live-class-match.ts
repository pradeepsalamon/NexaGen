import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Live-class student matches — shared contract
// ──────────────────────────────────────────────────────────────
// Students play each other while the coach watches every board. A round is
// paired automatically, by the coach, or by the students themselves
// (challenge → accept). Every move goes through REST (chess.js, guarded by
// `ply`); the `live_class_match` topic is a server-injected nudge.

export const LIVE_CLASS_MATCH_TOPIC = "live_class_match";

export const MATCH_MAX_PAIRS = 40;

/** Clocks start once each side has made its first move (lichess rule). */
export const MATCH_CLOCK_START_PLY = 2;

export const matchPairingModeSchema = z.enum(["AUTO", "COACH", "STUDENT_CHOICE"]);
export type MatchPairingMode = z.infer<typeof matchPairingModeSchema>;

export const matchColorSchema = z.enum(["white", "black"]);
export type MatchColor = z.infer<typeof matchColorSchema>;

export const matchGameStatusSchema = z.enum(["ONGOING", "FINISHED"]);
export type MatchGameStatus = z.infer<typeof matchGameStatusSchema>;

export const matchGameResultSchema = z.enum(["WHITE_WON", "BLACK_WON", "DRAW"]);
export type MatchGameResult = z.infer<typeof matchGameResultSchema>;

export const matchEndReasonSchema = z.enum([
  "CHECKMATE",
  "STALEMATE",
  "INSUFFICIENT_MATERIAL",
  "THREEFOLD_REPETITION",
  "FIFTY_MOVE_RULE",
  "RESIGNATION",
  "DRAW_AGREED",
  "TIMEOUT",
  "ADJUDICATED",
  "ABORTED",
  "ROUND_ENDED"
]);
export type MatchEndReason = z.infer<typeof matchEndReasonSchema>;

export const matchChallengeStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"]);
export type MatchChallengeStatus = z.infer<typeof matchChallengeStatusSchema>;

export const matchTimeControlSchema = z.object({
  initialSeconds: z.number().int().min(30).max(3600),
  incrementSeconds: z.number().int().min(0).max(60)
});
export type MatchTimeControl = z.infer<typeof matchTimeControlSchema>;

export const MATCH_TIME_CONTROL_PRESETS: { label: string; value: MatchTimeControl | null }[] = [
  { label: "No clock", value: null },
  { label: "3 + 2", value: { initialSeconds: 180, incrementSeconds: 2 } },
  { label: "5 + 3", value: { initialSeconds: 300, incrementSeconds: 3 } },
  { label: "10 + 5", value: { initialSeconds: 600, incrementSeconds: 5 } },
  { label: "15 + 10", value: { initialSeconds: 900, incrementSeconds: 10 } }
];

export const matchMoveSchema = z.object({ san: z.string(), uci: z.string() });
export type MatchMove = z.infer<typeof matchMoveSchema>;

const matchPlayerRefSchema = z.object({ id: z.string(), name: z.string() });
export type MatchPlayerRef = z.infer<typeof matchPlayerRefSchema>;

export const liveMatchGameSchema = z.object({
  id: z.string(),
  roundId: z.string(),
  white: matchPlayerRefSchema,
  black: matchPlayerRefSchema,
  startFen: z.string(),
  fen: z.string(),
  moves: z.array(matchMoveSchema),
  /** Half-moves played; every move request must echo it. */
  ply: z.number().int().min(0),
  /** Side to move; null once the game is over. */
  turn: matchColorSchema.nullable(),
  /** ISO time the side to move got the move. */
  turnSince: z.string(),
  /** Remaining ms at `turnSince`; null for an untimed game. */
  whiteClockMs: z.number().int().nullable(),
  blackClockMs: z.number().int().nullable(),
  incrementMs: z.number().int().min(0),
  /** ISO server time this copy was produced — clients derive clock skew from it. */
  serverTime: z.string(),
  status: matchGameStatusSchema,
  /** null on an aborted game or one cut short by the round ending. */
  result: matchGameResultSchema.nullable(),
  endReason: matchEndReasonSchema.nullable(),
  drawOfferedBy: matchColorSchema.nullable()
});
export type LiveMatchGame = z.infer<typeof liveMatchGameSchema>;

export type LiveMatchChallenge = {
  id: string;
  from: MatchPlayerRef;
  to: MatchPlayerRef;
  status: MatchChallengeStatus;
  createdAt: string;
};

export type LiveMatchPlayer = {
  studentId: string;
  name: string;
  /** Connected to the LiveKit room right now. */
  inClass: boolean;
  /** Their ongoing game in this round, if any. */
  gameId: string | null;
  played: number;
  points: number;
};

export type LiveMatchRound = {
  id: string;
  status: "ACTIVE" | "ENDED";
  pairingMode: MatchPairingMode;
  startFen: string;
  timeControl: MatchTimeControl | null;
  startedAt: string;
  endedAt: string | null;
  /** Coach/admin: every game. A student: only games they play in. */
  games: LiveMatchGame[];
  /** Coach/admin: every pending challenge. A student: only their own. */
  challenges: LiveMatchChallenge[];
  /** Everyone who has played or can be paired (students in class). */
  players: LiveMatchPlayer[];
};

export type LiveMatchStateResponse = { round: LiveMatchRound | null };

export type LiveMatchGameResponse = { game: LiveMatchGame };

// ── Data-channel message ──

export const liveMatchMessageSchema = z.discriminatedUnion("type", [
  // Refetch the round (started, paired, challenge sent/answered, mode changed).
  z.object({ type: z.literal("ROUND_CHANGED"), roundId: z.string() }),
  z.object({ type: z.literal("ROUND_ENDED"), roundId: z.string() }),
  z.object({ type: z.literal("MATCH_GAME"), game: liveMatchGameSchema })
]);
export type LiveMatchMessage = z.infer<typeof liveMatchMessageSchema>;

export function encodeLiveMatch(msg: LiveMatchMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeLiveMatch(payload: Uint8Array): LiveMatchMessage | null {
  try {
    const parsed = liveMatchMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Requests ──

export const matchPairSchema = z
  .object({ whiteId: z.string().min(1), blackId: z.string().min(1) })
  .refine((p) => p.whiteId !== p.blackId, "A student cannot play themselves.");
export type MatchPair = z.infer<typeof matchPairSchema>;

export const startLiveMatchRoundRequestSchema = z.object({
  pairingMode: matchPairingModeSchema,
  /** AUTO: who to pair (omitted = every student in class). */
  studentIds: z.array(z.string().min(1)).max(MATCH_MAX_PAIRS * 2).optional(),
  /** COACH: the pairs the coach built. */
  pairs: z.array(matchPairSchema).max(MATCH_MAX_PAIRS).optional(),
  /** Omitted = the standard starting position. */
  startFen: z.string().max(120).optional(),
  timeControl: matchTimeControlSchema.nullable().optional()
});
export type StartLiveMatchRoundRequest = z.infer<typeof startLiveMatchRoundRequestSchema>;

export const updateLiveMatchRoundRequestSchema = z.object({
  pairingMode: matchPairingModeSchema
});
export type UpdateLiveMatchRoundRequest = z.infer<typeof updateLiveMatchRoundRequestSchema>;

export const liveMatchPairRequestSchema = z.discriminatedUnion("type", [
  // Pair every free student (or just these) automatically.
  z.object({ type: z.literal("AUTO"), studentIds: z.array(z.string().min(1)).max(MATCH_MAX_PAIRS * 2).optional() }),
  z.object({ type: z.literal("MANUAL"), pairs: z.array(matchPairSchema).min(1).max(MATCH_MAX_PAIRS) })
]);
export type LiveMatchPairRequest = z.infer<typeof liveMatchPairRequestSchema>;

export const liveMatchChallengeRequestSchema = z.object({ opponentId: z.string().min(1) });
export type LiveMatchChallengeRequest = z.infer<typeof liveMatchChallengeRequestSchema>;

export const liveMatchChallengeResponseRequestSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE", "CANCEL"])
});
export type LiveMatchChallengeResponseRequest = z.infer<typeof liveMatchChallengeResponseRequestSchema>;

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a UCI move.");

export const liveMatchMoveRequestSchema = z.object({
  uci: uciSchema,
  ply: z.number().int().min(0)
});
export type LiveMatchMoveRequest = z.infer<typeof liveMatchMoveRequestSchema>;

export const liveMatchGameActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RESIGN") }),
  z.object({ action: z.literal("OFFER_DRAW") }),
  z.object({ action: z.literal("ACCEPT_DRAW") }),
  z.object({ action: z.literal("DECLINE_DRAW") }),
  // Either player (or the coach): the side to move has run out of time.
  z.object({ action: z.literal("CLAIM_TIMEOUT") }),
  // Coach only.
  z.object({ action: z.literal("ADJUDICATE"), result: matchGameResultSchema }),
  z.object({ action: z.literal("ABORT") })
]);
export type LiveMatchGameActionRequest = z.infer<typeof liveMatchGameActionRequestSchema>;

// ── Helpers shared by the API and both views ──

export const MATCH_END_REASON_LABELS: Record<MatchEndReason, string> = {
  CHECKMATE: "Checkmate",
  STALEMATE: "Stalemate",
  INSUFFICIENT_MATERIAL: "Insufficient material",
  THREEFOLD_REPETITION: "Threefold repetition",
  FIFTY_MOVE_RULE: "50-move rule",
  RESIGNATION: "Resignation",
  DRAW_AGREED: "Draw agreed",
  TIMEOUT: "Time out",
  ADJUDICATED: "Decided by the coach",
  ABORTED: "Aborted",
  ROUND_ENDED: "Round ended"
};

export const MATCH_PAIRING_MODE_LABELS: Record<MatchPairingMode, string> = {
  AUTO: "Auto pair",
  COACH: "Coach pairs",
  STUDENT_CHOICE: "Students choose"
};

export function matchScoreLabel(game: Pick<LiveMatchGame, "result">): string {
  if (game.result === "WHITE_WON") return "1-0";
  if (game.result === "BLACK_WON") return "0-1";
  if (game.result === "DRAW") return "½-½";
  return "*";
}

/** Points a student earned from one finished game (1 / ½ / 0), or null if it doesn't count. */
export function matchPointsFor(
  game: Pick<LiveMatchGame, "white" | "black" | "result">,
  studentId: string
): number | null {
  if (!game.result) return null;
  if (game.result === "DRAW") return 0.5;
  const won = game.result === "WHITE_WON" ? game.white.id : game.black.id;
  return won === studentId ? 1 : 0;
}

/** Remaining ms for one side, counting down live for the side to move. */
export function matchClockRemaining(
  game: Pick<LiveMatchGame, "whiteClockMs" | "blackClockMs" | "turn" | "turnSince" | "ply" | "status">,
  color: MatchColor,
  nowMs: number
): number | null {
  const base = color === "white" ? game.whiteClockMs : game.blackClockMs;
  if (base === null) return null;
  if (game.status !== "ONGOING" || game.turn !== color || game.ply < MATCH_CLOCK_START_PLY) return base;
  return Math.max(0, base - Math.max(0, nowMs - Date.parse(game.turnSince)));
}

/** Coach monitor order: running games first (draw offers on top), then finished. */
export function compareMatchGamesForCoach(a: LiveMatchGame, b: LiveMatchGame): number {
  const done = Number(a.status === "FINISHED") - Number(b.status === "FINISHED");
  if (done !== 0) return done;
  if (a.drawOfferedBy && !b.drawOfferedBy) return -1;
  if (!a.drawOfferedBy && b.drawOfferedBy) return 1;
  return a.white.name.localeCompare(b.white.name);
}

export type MatchPairingCandidate = { id: string; points: number };
export type MatchPairingHistory = { whiteId: string; blackId: string }[];

/**
 * Swiss-style pairing: players sorted by points (random tie-break), each
 * paired with the nearest-scored player they haven't met yet; the one who has
 * had White less often gets White. An odd player out sits out (`bye`).
 */
export function autoPairPlayers(
  candidates: MatchPairingCandidate[],
  history: MatchPairingHistory = [],
  random: () => number = Math.random
): { pairs: MatchPair[]; bye: string | null } {
  const met = new Set(history.map((h) => [h.whiteId, h.blackId].sort().join("|")));
  const whites = new Map<string, number>();
  for (const h of history) {
    whites.set(h.whiteId, (whites.get(h.whiteId) ?? 0) + 1);
    whites.set(h.blackId, (whites.get(h.blackId) ?? 0) - 1);
  }

  const pool = candidates
    .map((c) => ({ ...c, tie: random() }))
    .sort((a, b) => b.points - a.points || a.tie - b.tie);

  const pairs: MatchPair[] = [];
  while (pool.length >= 2) {
    const first = pool.shift()!;
    let index = pool.findIndex((p) => !met.has([first.id, p.id].sort().join("|")));
    if (index === -1) index = 0;
    const [second] = pool.splice(index, 1);
    const firstBalance = whites.get(first.id) ?? 0;
    const secondBalance = whites.get(second.id) ?? 0;
    const firstWhite = firstBalance === secondBalance ? random() < 0.5 : firstBalance < secondBalance;
    pairs.push(
      firstWhite ? { whiteId: first.id, blackId: second.id } : { whiteId: second.id, blackId: first.id }
    );
  }
  return { pairs, bye: pool[0]?.id ?? null };
}
