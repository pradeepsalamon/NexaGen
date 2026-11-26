import { PLAY_SOURCE_LABELS, type PlayFinding, type PlayItem } from "@nexa-chess/types";
import { completeOnRoute, type ChatAnswer, type ChatModelConfig } from "../chat-model";

// ──────────────────────────────────────────────────────────────
// The outside AI of the AI play review (docs/AI_PLAY_REVIEW.md §3.3): writes
// short coach-style comments on top of our own engine review, with the model
// the platform maps to "AI play review comments" (docs/AI_PROVIDERS.md).
// Called ONLY for students whose switch is on (`outsideAiAllowed`), and only
// with the providers their consent named, with PSEUDONYMISED play —
// positions, moves and the engine's findings. Never a name, id, batch,
// academy or date.
// ──────────────────────────────────────────────────────────────

/** Everything the outside AI is told. Built only by `pseudonymisePlay`. */
export type PseudonymisedPlay = {
  kind: string;
  segments: {
    label: string | null;
    startFen: string;
    /** The side "the player" had; null when it changes move to move (a shared board). */
    playerSide: "white" | "black" | null;
    /** SAN in order, the player's own moves marked with a leading "*". */
    moves: string[];
    result: string | null;
  }[];
  accuracy: number | null;
  findings: {
    segment: number;
    moveNumber: number;
    kind: string;
    played: string;
    better: string | null;
    motif: string | null;
  }[];
};

/** Cap on what one request carries (a long own game is cut, never the findings). */
const MAX_MOVES_PER_SEGMENT = 160;
const MAX_SEGMENTS = 12;

/**
 * The only way play leaves for the outside AI. Copies chess facts field by
 * field (never spreads a record), so ids, names, class titles, batches,
 * academies and timestamps can't ride along.
 */
export function pseudonymisePlay(
  item: Pick<PlayItem, "segments" | "source">,
  review: { accuracy: number | null; findings: PlayFinding[] }
): PseudonymisedPlay {
  return {
    accuracy: review.accuracy,
    findings: review.findings.map((f) => ({
      better: f.bestMoveSan,
      kind: f.kind,
      motif: f.motif,
      moveNumber: Math.ceil(f.ply / 2),
      played: f.playedSan,
      segment: f.segment
    })),
    kind: PLAY_SOURCE_LABELS[item.source],
    segments: item.segments.slice(0, MAX_SEGMENTS).map((s) => ({
      // Rush labels are "Puzzle n (rating)"; anything else may hold a title, so it is dropped.
      label: item.source === "RUSH" ? s.label : null,
      moves: s.moves.slice(0, MAX_MOVES_PER_SEGMENT).map((m) => `${m.byStudent ? "*" : ""}${m.san ?? m.uci}`),
      playerSide: s.studentSide,
      result: s.result,
      startFen: s.startFen
    }))
  };
}

export const OUTSIDE_AI_SYSTEM_PROMPT = [
  "You are a friendly chess coach writing to a young student about their own play.",
  "You get the positions, the moves (the student's own moves start with *) and what a chess engine found.",
  "Write 3 to 5 short sentences: one thing they did well, the most important lesson from the engine's findings",
  "(name the better move when given), and one concrete thing to practise.",
  "Use only the facts given; never invent moves or evaluations. Plain language, no headings, no lists, no emojis."
].join(" ");

export function outsideAiUserPrompt(play: PseudonymisedPlay): string {
  return JSON.stringify(play);
}

/** The longest comment stored (a runaway answer is cut). */
export const MAX_COMMENT_LENGTH = 1500;

export interface OutsideAiProvider {
  /** The models mapped to play review comments, main first; empty when none is connected (nothing is sent). */
  route(): ChatModelConfig[];
  comment(route: readonly ChatModelConfig[], play: PseudonymisedPlay, signal: AbortSignal): Promise<ChatAnswer>;
}

export const OUTSIDE_AI_PROVIDER = Symbol("OUTSIDE_AI_PROVIDER");

/** The comment's own answer room (thinking models get `OUTSIDE_THINKING_TOKENS` on top). */
const COMMENT_MAX_TOKENS = 400;

/** Play review comments through the platform's route. Built by a factory provider. */
export class OpenAiCompatibleProvider implements OutsideAiProvider {
  constructor(private readonly routeFor: () => ChatModelConfig[]) {}

  route(): ChatModelConfig[] {
    return this.routeFor();
  }

  async comment(route: readonly ChatModelConfig[], play: PseudonymisedPlay, signal: AbortSignal): Promise<ChatAnswer> {
    const answer = await completeOnRoute(
      route,
      { json: false, maxTokens: COMMENT_MAX_TOKENS, system: OUTSIDE_AI_SYSTEM_PROMPT, temperature: 0.4, user: outsideAiUserPrompt(play) },
      signal
    );
    return { servedBy: answer.servedBy, text: answer.text.trim().slice(0, MAX_COMMENT_LENGTH) };
  }
}
