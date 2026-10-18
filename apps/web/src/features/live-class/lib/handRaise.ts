/**
 * Raise-hand wire format.
 *
 * This rides a LiveKit **data channel** rather than participant attributes,
 * which is what it used before and why it never worked for students: attributes
 * and metadata are both gated on `canUpdateOwnMetadata`, and students are
 * deliberately issued that as `false` so they cannot rewrite the signed
 * `{ role }` metadata the chat, video grid and board sync trust (AUDIT C7).
 * `setAttributes` was therefore rejected server-side and no one ever saw the
 * hand. Students *do* hold `canPublishData`, so a data packet is the channel
 * that is actually open to them.
 *
 * Nothing here is authorization-sensitive: a raised hand is a request for
 * attention, so a participant announcing their own is exactly the trust level
 * required. The identity is taken from the LiveKit envelope, never from the
 * payload, so no one can raise a hand on someone else's behalf.
 */
export const HAND_RAISE_TOPIC = "hand_raise";

export interface RaisedHand {
  /** Full LiveKit participant identity. */
  identity: string;
  name: string;
  /** epoch ms the hand went up — lets the UI order by who asked first. */
  at: number;
}

export type HandRaiseMessage =
  | { type: "HAND_RAISE"; name: string; raised: boolean; at: number }
  /** Sent on join: anyone currently holding a hand up re-announces it. */
  | { type: "HAND_RAISE_QUERY" };

export function encodeHandRaise(msg: HandRaiseMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeHandRaise(payload: Uint8Array): HandRaiseMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as HandRaiseMessage;
    if (parsed?.type === "HAND_RAISE_QUERY") return parsed;
    if (
      parsed?.type === "HAND_RAISE" &&
      typeof parsed.raised === "boolean" &&
      typeof parsed.name === "string"
    ) {
      return { ...parsed, at: typeof parsed.at === "number" ? parsed.at : Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}
