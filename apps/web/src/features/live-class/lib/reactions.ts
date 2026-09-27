/**
 * Emoji reactions wire format. Cosmetic only: rides its own data-channel topic
 * like `hand_raise`, the sender identity comes from the LiveKit envelope, and a
 * receiver drops anything outside `REACTION_EMOJIS` so nobody can push
 * arbitrary text onto everyone's screen.
 */
export const REACTION_TOPIC = "reaction";

export const REACTION_EMOJIS = ["👏", "🎉", "🎊", "🔥", "👍", "❤️", "😂", "😮"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** The burst shown when a student solves the class puzzle. */
export const CELEBRATION_EMOJIS: readonly ReactionEmoji[] = ["👏", "🎊", "🎉"];

export type ReactionMessage =
  | { type: "REACTION"; emoji: ReactionEmoji; name: string }
  /** `name` is null when the puzzle's leaderboard is private or anonymized. */
  | { type: "CELEBRATE"; name: string | null };

const allowed = new Set<string>(REACTION_EMOJIS);

export function encodeReaction(msg: ReactionMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeReaction(payload: Uint8Array): ReactionMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as ReactionMessage;
    if (parsed?.type === "REACTION" && allowed.has(parsed.emoji) && typeof parsed.name === "string") {
      return { type: "REACTION", emoji: parsed.emoji, name: parsed.name.slice(0, 60) };
    }
    if (parsed?.type === "CELEBRATE") {
      return { type: "CELEBRATE", name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : null };
    }
    return null;
  } catch {
    return null;
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Synthesized, so there is no audio asset to license or preload. */
export function playReactionSound(kind: "pop" | "celebrate") {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "pop") {
    tone(ctx, 880, now, 0.12, 0.08);
    return;
  }
  // Rising major arpeggio.
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, now + i * 0.09, 0.28, 0.1));
}
