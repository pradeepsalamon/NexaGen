import { z } from "zod";
import type { LiveBoardState } from "./live-class-board-state";

// Admin "Live now" monitor: every LIVE class at a glance, plus a hidden,
// receive-only seat in any of them. Admins need no invite, enrolment or
// waiting-room admission — the API only checks the ADMIN / SUPER_ADMIN role.

/**
 * LiveKit identity prefix of a spectator seat (`spectator_<userId>_<tabId>`).
 * Attendance and every "who is in the room" count skip it — a watching admin is
 * not an attendee.
 */
export const LIVE_CLASS_SPECTATOR_IDENTITY_PREFIX = "spectator_";

/** Signed LiveKit metadata role of a spectator seat. */
export const LIVE_CLASS_SPECTATOR_ROLE = "SPECTATOR";

export function isSpectatorIdentity(identity: string | undefined | null): boolean {
  return !!identity?.startsWith(LIVE_CLASS_SPECTATOR_IDENTITY_PREFIX);
}

export interface LiveClassMonitorItem {
  classId: string;
  title: string;
  topic: string | null;
  isDemo: boolean;
  batchId: string | null;
  batchName: string | null;
  coachId: string;
  coachName: string;
  /** ISO-8601. */
  startsAt: string;
  /** ISO-8601. */
  endsAt: string;
  /** ISO-8601; when the coach pressed Start. */
  startedAt: string | null;
  /** Students enrolled in the batch (0 for a demo class). */
  enrolledCount: number;
  /** Students in the room right now; null when LiveKit could not be asked. */
  studentsInRoom: number | null;
  /** True when the coach is connected; null when LiveKit could not be asked. */
  coachInRoom: boolean | null;
  isRecording: boolean;
}

export interface LiveClassMonitorResponse {
  classes: LiveClassMonitorItem[];
  /** ISO-8601 server time the list was built at. */
  generatedAt: string;
}

export const spectateLiveClassRequestSchema = z.object({
  /** Per-tab id, so two admin tabs get two seats instead of kicking each other. */
  clientId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
});

export type SpectateLiveClassRequest = z.infer<typeof spectateLiveClassRequestSchema>;

export interface SpectateLiveClassResponse {
  /** Hidden, subscribe-only LiveKit token for this one room. */
  token: string;
  roomName: string;
  class: LiveClassMonitorItem;
  /** Last durable board snapshot, so the board paints before the coach re-syncs. */
  boardState: LiveBoardState | null;
}
