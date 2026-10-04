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

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gain: number,
  { type = "triangle", glideTo }: { type?: OscillatorType; glideTo?: number } = {},
) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

/** A filtered white-noise burst: claps, pops and whooshes. */
function noise(
  ctx: AudioContext,
  start: number,
  duration: number,
  gain: number,
  { freq, q = 1, type = "bandpass", sweepTo }: { freq: number; q?: number; type?: BiquadFilterType; sweepTo?: number },
) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(start, Math.random() * 0.5);
  src.stop(start + duration + 0.02);
}

function claps(ctx: AudioContext, start: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const t = start + i * 0.13 + Math.random() * 0.03;
    noise(ctx, t, 0.09, 0.35, { freq: 1100 + Math.random() * 500, q: 0.9 });
    noise(ctx, t + 0.008, 0.05, 0.15, { freq: 2400, q: 1.5 });
  }
}

function popper(ctx: AudioContext, start: number) {
  noise(ctx, start, 0.12, 0.45, { freq: 600, q: 0.7 });
  noise(ctx, start + 0.05, 0.5, 0.06, { freq: 3000, type: "highpass", sweepTo: 8000 });
}

function sparkle(ctx: AudioContext, start: number, notes: number[]) {
  notes.forEach((f, i) => tone(ctx, f, start + i * 0.07, 0.22, 0.05, { type: "sine" }));
}

const EMOJI_SOUNDS: Record<ReactionEmoji, (ctx: AudioContext, now: number) => void> = {
  "👏": (ctx, now) => claps(ctx, now, 5),
  "🎉": (ctx, now) => {
    popper(ctx, now);
    sparkle(ctx, now + 0.12, [1318.5, 1568, 2093]);
  },
  "🎊": (ctx, now) => {
    popper(ctx, now);
    sparkle(ctx, now + 0.1, [2093, 1760, 2349, 1976, 2637]);
  },
  "🔥": (ctx, now) => noise(ctx, now, 0.6, 0.25, { freq: 300, q: 0.8, sweepTo: 2500 }),
  "👍": (ctx, now) => {
    tone(ctx, 660, now, 0.12, 0.08);
    tone(ctx, 990, now + 0.09, 0.18, 0.08);
  },
  "❤️": (ctx, now) => {
    tone(ctx, 110, now, 0.14, 0.25, { type: "sine", glideTo: 70 });
    tone(ctx, 110, now + 0.2, 0.18, 0.2, { type: "sine", glideTo: 70 });
  },
  "😂": (ctx, now) => {
    [520, 480, 440, 400].forEach((f, i) =>
      tone(ctx, f, now + i * 0.12, 0.09, 0.06, { type: "square", glideTo: f * 0.85 }),
    );
  },
  "😮": (ctx, now) => tone(ctx, 300, now, 0.45, 0.09, { type: "sine", glideTo: 620 }),
};

/** Synthesized, so there is no audio asset to license or preload. */
export function playReactionSound(kind: ReactionEmoji | "celebrate") {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind !== "celebrate") {
    EMOJI_SOUNDS[kind](ctx, now);
    return;
  }
  // Puzzle solved: applause, a popper, then a rising fanfare.
  claps(ctx, now, 8);
  popper(ctx, now + 0.05);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, now + 0.15 + i * 0.09, 0.28, 0.08));
}
