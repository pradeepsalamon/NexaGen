import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Live-class move poll ("Response") — shared contract
// ──────────────────────────────────────────────────────────────
// The coach asks "what would you play?" on a position; each student privately
// submits one legal move (changeable while the poll is open). REST is the source
// of truth; the `move_poll` topic is a server-injected nudge to refetch.

export const LIVE_CLASS_MOVE_POLL_TOPIC = "move_poll";

export const movePollStatusSchema = z.enum(["OPEN", "CLOSED", "ENDED"]);
export type MovePollStatus = z.infer<typeof movePollStatusSchema>;

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a UCI move.");

export type LiveMovePollAnswer = {
  studentId: string;
  studentName: string;
  uci: string;
  san: string;
  answeredAt: string;
};

export type LiveMovePollOption = {
  uci: string;
  san: string;
  count: number;
  /** Coach/admin only — empty for a student. */
  studentNames: string[];
};

export type LiveMovePoll = {
  id: string;
  status: MovePollStatus;
  fen: string;
  prompt: string | null;
  /** Students see the tally once the poll is closed and revealed. */
  revealed: boolean;
  correctUci: string | null;
  correctSan: string | null;
  startedAt: string;
  closedAt: string | null;
  answerCount: number;
  /** The viewing student's own answer; null for the coach. */
  myAnswer: { uci: string; san: string } | null;
  /** Coach/admin: every answer. A student: empty. */
  answers: LiveMovePollAnswer[];
  /** Coach/admin: always. A student: only when closed and revealed. */
  options: LiveMovePollOption[];
};

export type LiveMovePollStateResponse = {
  poll: LiveMovePoll | null;
};

// ── Data-channel message ──

export const liveMovePollMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("POLL_CHANGED"), pollId: z.string() }),
  z.object({ type: z.literal("POLL_ANSWERED"), pollId: z.string(), answerCount: z.number().int() })
]);
export type LiveMovePollMessage = z.infer<typeof liveMovePollMessageSchema>;

export function encodeLiveMovePoll(msg: LiveMovePollMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeLiveMovePoll(payload: Uint8Array): LiveMovePollMessage | null {
  try {
    const parsed = liveMovePollMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Requests ──

export const startLiveMovePollRequestSchema = z.object({
  fen: z.string().min(1).max(120),
  prompt: z.string().trim().max(200).optional()
});
export type StartLiveMovePollRequest = z.infer<typeof startLiveMovePollRequestSchema>;

export const answerLiveMovePollRequestSchema = z.object({
  uci: uciSchema
});
export type AnswerLiveMovePollRequest = z.infer<typeof answerLiveMovePollRequestSchema>;

export const updateLiveMovePollRequestSchema = z
  .object({
    /** CLOSED stops answers; OPEN reopens a closed poll. */
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    revealed: z.boolean().optional(),
    correctUci: uciSchema.nullable().optional()
  })
  .refine((v) => v.status !== undefined || v.revealed !== undefined || v.correctUci !== undefined, {
    message: "Nothing to update."
  });
export type UpdateLiveMovePollRequest = z.infer<typeof updateLiveMovePollRequestSchema>;

// ── Helpers ──

/** Group answers by move, most popular first. */
export function tallyMovePollAnswers(answers: LiveMovePollAnswer[]): LiveMovePollOption[] {
  const byMove = new Map<string, LiveMovePollOption>();
  for (const answer of answers) {
    const option = byMove.get(answer.uci) ?? { uci: answer.uci, san: answer.san, count: 0, studentNames: [] };
    option.count += 1;
    option.studentNames.push(answer.studentName);
    byMove.set(answer.uci, option);
  }
  return [...byMove.values()]
    .map((o) => ({ ...o, studentNames: [...o.studentNames].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.count - a.count || a.san.localeCompare(b.san));
}
