import { Track, type Participant } from "livekit-client";

/**
 * "Who is doing something right now" ordering, shared by the People panel, the
 * meeting video grid and the recorder template so all three agree (the way
 * Zoom / Meet float the active people to the top).
 *
 * Tiers, highest first:
 *  1. sharing their screen
 *  2. speaking — held for SPEAKING_HOLD_MS after they stop, so a speaker who
 *     pauses for breath does not bounce down and back up
 *  3. hand raised — earliest hand first, the order the coach should answer
 *  4. spoke recently (RECENT_SPEAKER_MS) — most recent first
 *  5. camera or microphone on
 *  6. everyone else
 *
 * Ties break on a fixed key (name, then identity) so the list only moves when
 * someone's activity actually changes.
 */

export const SPEAKING_HOLD_MS = 2500;
export const RECENT_SPEAKER_MS = 30_000;

export interface ActivityContext {
  /** epoch ms each identity was last heard; see `trackSpeakers`. */
  lastSpokeAt: ReadonlyMap<string, number>;
  now: number;
  /** identity → epoch ms the hand went up. */
  raisedHandAt?: ReadonlyMap<string, number> | Record<string, { at: number }>;
}

function handAt(ctx: ActivityContext, identity: string): number | undefined {
  const hands = ctx.raisedHandAt;
  if (!hands) return undefined;
  if (hands instanceof Map) return hands.get(identity);
  return (hands as Record<string, { at: number }>)[identity]?.at;
}

function isPublishing(p: Participant, source: Track.Source) {
  const pub = p.getTrackPublication(source);
  return !!pub && !pub.isMuted;
}

export function isSharingScreen(p: Participant) {
  return isPublishing(p, Track.Source.ScreenShare);
}

/** Speaking now, or within the hold window. */
export function isActivelySpeaking(p: Participant, ctx: ActivityContext) {
  if (p.isSpeaking) return true;
  const last = ctx.lastSpokeAt.get(p.identity);
  return last !== undefined && ctx.now - last < SPEAKING_HOLD_MS;
}

/** Tier (lower = higher up) plus an in-tier sort value (lower = first). */
function rank(p: Participant, ctx: ActivityContext): [number, number] {
  if (isSharingScreen(p)) return [0, 0];
  if (isActivelySpeaking(p, ctx)) return [1, 0];
  const hand = handAt(ctx, p.identity);
  if (hand !== undefined) return [2, hand];
  const last = ctx.lastSpokeAt.get(p.identity);
  if (last !== undefined && ctx.now - last < RECENT_SPEAKER_MS) return [3, -last];
  if (isPublishing(p, Track.Source.Camera) || isPublishing(p, Track.Source.Microphone)) {
    return [4, 0];
  }
  return [5, 0];
}

export function compareByActivity(a: Participant, b: Participant, ctx: ActivityContext) {
  const [aTier, aValue] = rank(a, ctx);
  const [bTier, bValue] = rank(b, ctx);
  if (aTier !== bTier) return aTier - bTier;
  if (aValue !== bValue) return aValue - bValue;
  const byName = (a.name || a.identity).localeCompare(b.name || b.identity);
  return byName !== 0 ? byName : a.identity.localeCompare(b.identity);
}

export function sortByActivity<T>(
  items: readonly T[],
  getParticipant: (item: T) => Participant,
  ctx: ActivityContext,
): T[] {
  return [...items].sort((a, b) => compareByActivity(getParticipant(a), getParticipant(b), ctx));
}

export interface SpeakerTracker {
  /** Who was speaking as of the last update. */
  current: Set<string>;
  /** identity → epoch ms last heard. */
  lastSpokeAt: Map<string, number>;
}

export function createSpeakerTracker(): SpeakerTracker {
  return { current: new Set(), lastSpokeAt: new Map() };
}

/**
 * Applies a LiveKit active-speakers update. Both the new speakers *and* the
 * ones who just went quiet are stamped "now" — LiveKit only reports changes, so
 * the moment someone drops out of the list is the moment they were last heard.
 * Entries older than the recent window are pruned.
 */
export function trackSpeakers(
  tracker: SpeakerTracker,
  speakers: readonly Participant[],
  now = Date.now(),
) {
  const next = new Set(speakers.map((s) => s.identity));
  for (const identity of tracker.current) tracker.lastSpokeAt.set(identity, now);
  for (const identity of next) tracker.lastSpokeAt.set(identity, now);
  tracker.current = next;
  for (const [identity, at] of tracker.lastSpokeAt) {
    if (now - at > RECENT_SPEAKER_MS) tracker.lastSpokeAt.delete(identity);
  }
}
