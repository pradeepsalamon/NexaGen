import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { PLAY_SOURCE_LABELS, type PlayFinding, type PlayItem } from "@nexa-chess/types";

// ──────────────────────────────────────────────────────────────
// The outside AI of the AI play review (docs/AI_PLAY_REVIEW.md §3.3): an
// OpenAI-compatible chat API that writes short coach-style comments on top of
// our own engine review. Provider-neutral: URL, key and model from env, all
// unset = off. Called ONLY for students whose switch is on
// (`outsideAiAllowed`), with PSEUDONYMISED play — positions, moves and the
// engine's findings. Never a name, id, batch, academy or date.
// ──────────────────────────────────────────────────────────────

export type OutsideAiConfig = {
  url: string;
  apiKey: string;
  model: string;
  name: string;
  timeoutMs: number;
};

/** The provider settings, or null when any of URL / key / model is missing. */
export function outsideAiConfigFromEnv(env: ReturnType<typeof getApiEnv> = getApiEnv()): OutsideAiConfig | null {
  const url = env.AI_REVIEW_PROVIDER_URL?.trim();
  const apiKey = env.AI_REVIEW_PROVIDER_API_KEY?.trim();
  const model = env.AI_REVIEW_PROVIDER_MODEL?.trim();
  if (!url || !apiKey || !model) return null;
  return {
    apiKey,
    model,
    name: env.AI_REVIEW_PROVIDER_NAME?.trim() || new URL(url).hostname,
    timeoutMs: env.AI_REVIEW_PROVIDER_TIMEOUT_MS,
    url: url.replace(/\/+$/, "")
  };
}

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
  /** Null when the outside AI isn't configured (nothing is ever sent). */
  readonly config: OutsideAiConfig | null;
  comment(play: PseudonymisedPlay, signal?: AbortSignal): Promise<string>;
}

export const OUTSIDE_AI_PROVIDER = Symbol("OUTSIDE_AI_PROVIDER");

/** OpenAI-compatible chat completions (`POST <url>/chat/completions`). Built by a factory provider. */
export class OpenAiCompatibleProvider implements OutsideAiProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(readonly config: OutsideAiConfig | null) {}

  async comment(play: PseudonymisedPlay, signal?: AbortSignal): Promise<string> {
    const config = this.config;
    if (!config) throw new Error("The outside AI is not configured.");
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const response = await fetch(`${config.url}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: 400,
        messages: [
          { content: OUTSIDE_AI_SYSTEM_PROMPT, role: "system" },
          { content: outsideAiUserPrompt(play), role: "user" }
        ],
        model: config.model,
        temperature: 0.4
      }),
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    if (!response.ok) {
      // The body may echo the request; only the status is logged.
      this.logger.warn(`Outside AI answered ${response.status}`);
      throw new Error(`The outside AI answered ${response.status}.`);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("The outside AI returned no text.");
    return text.trim().slice(0, MAX_COMMENT_LENGTH);
  }
}
