import { z } from "zod";

// Shared contract for the two coach-moderation surfaces that were added
// alongside the pre-class settings stack:
//
//  1. force-muting one participant's already-published mic/camera/screen share
//     (`POST /live-class/:id/moderate`), and
//  2. one-to-one private chat, which is deliberately student <-> coach only.
//
// Both are enforced server-side; the web UI only mirrors what the API allows.

// ──────────────────────────────────────────────
// Force-mute
// ──────────────────────────────────────────────

/** Track sources a coach may switch off on someone else's behalf. */
export const moderatableSourceSchema = z.enum(["microphone", "camera", "screen_share"]);
export type ModeratableSource = z.infer<typeof moderatableSourceSchema>;

export const moderateParticipantRequestSchema = z.object({
  /** Full LiveKit participant identity (`<userId>_<clientId>`). */
  identity: z.string().min(1).max(200),
  source: moderatableSourceSchema,
});

export type ModerateParticipantRequest = z.infer<typeof moderateParticipantRequestSchema>;

export interface ModerateParticipantResponse {
  /** False when the participant had nothing published on that source. */
  muted: boolean;
  identity: string;
  source: ModeratableSource;
}

/**
 * Topic the API injects a moderation notice on so the room can explain a track
 * that just went dead. Purely cosmetic — the mute itself already happened at
 * the SFU, so a dropped packet costs a toast, never the enforcement.
 */
export const LIVE_CLASS_MODERATION_TOPIC = "moderation";

export interface ModerationNotice {
  type: "FORCE_MUTE";
  /** Identity whose track was switched off. */
  identity: string;
  source: ModeratableSource;
  /** Display name of the coach who did it. */
  byName: string;
}

export const MODERATED_SOURCE_LABEL: Record<ModeratableSource, string> = {
  microphone: "microphone",
  camera: "camera",
  screen_share: "screen share",
};

// ──────────────────────────────────────────────
// Private chat
// ──────────────────────────────────────────────

export const saveLiveChatMessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  /** LiveKit's message id, so history reconciliation dedupes on identity. */
  clientMessageId: z.string().max(200).optional(),
  /** User id of the single recipient. Omitted / null = the whole room. */
  recipientId: z.string().min(1).max(50).nullish(),
});

export type SaveLiveChatMessageRequest = z.infer<typeof saveLiveChatMessageRequestSchema>;

export interface LiveChatMessageResponse {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string | null;
  /** null for a room-wide message. */
  recipientId: string | null;
  message: string;
  clientMessageId: string | null;
  createdAt: string;
}

/**
 * Whether `senderRole` may privately message `recipientRole`.
 *
 * The product rule is one-to-one with the coach only — students never get a
 * private channel to each other. This is the single place that decides it, so
 * the API (which rejects the write) and the web client (which both hides the
 * option and drops inbound packets that break the rule) cannot drift apart.
 */
export function privateChatRecipientAllowed(
  senderRole: string | null | undefined,
  recipientRole: string | null | undefined,
): boolean {
  const staff = (role: string | null | undefined) =>
    role === "COACH" || role === "ADMIN" || role === "SUPER_ADMIN";
  // Staff may DM anyone in their class; everyone else may only DM staff.
  return staff(senderRole) || staff(recipientRole);
}

/** Data-channel topic private messages ride, addressed to one identity. */
export const LIVE_CLASS_DIRECT_CHAT_TOPIC = "private_chat";

export interface DirectChatMessage {
  type: "DM";
  /** User id of the intended recipient — the envelope identity is the sender. */
  toUserId: string;
  /** Sender's user id, so the receiver can key the thread without parsing identity. */
  fromUserId: string;
  message: string;
  /** epoch ms */
  at: number;
  clientMessageId: string;
}

export function encodeDirectChat(msg: DirectChatMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeDirectChat(payload: Uint8Array): DirectChatMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as DirectChatMessage;
    if (
      parsed?.type !== "DM" ||
      typeof parsed.toUserId !== "string" ||
      typeof parsed.fromUserId !== "string" ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    return {
      ...parsed,
      at: typeof parsed.at === "number" ? parsed.at : Date.now(),
      clientMessageId: typeof parsed.clientMessageId === "string" ? parsed.clientMessageId : "",
    };
  } catch {
    return null;
  }
}
