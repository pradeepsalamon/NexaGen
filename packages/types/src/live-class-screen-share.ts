import { z } from "zod";

// Screen-share request -> coach approval. `LiveClassSettings.student.
// screenShare` (live-class-settings.ts) is a static, class-wide policy; this
// is a per-student override on top of it, requested live and resolved by the
// coach, mirroring the waiting-room request/resolve contract.

export const screenShareRequestStatusSchema = z.enum(["PENDING", "APPROVED", "DENIED", "REVOKED"]);
export type ScreenShareRequestStatus = z.infer<typeof screenShareRequestStatusSchema>;

export interface ScreenShareRequestEntry {
  id: string;
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  status: ScreenShareRequestStatus;
  requestedAt: string;
}

export const resolveScreenShareRequestSchema = z.object({
  studentId: z.string().min(1),
  action: z.enum(["APPROVE", "DENY", "REVOKE"]),
});

export type ResolveScreenShareRequest = z.infer<typeof resolveScreenShareRequestSchema>;

export interface ScreenShareRequestListResponse {
  entries: ScreenShareRequestEntry[];
}

/**
 * Nudge only — the REST endpoints are the source of truth, same contract as
 * `LIVE_CLASS_WAITING_ROOM_TOPIC`. A dropped packet costs a missed toast, not
 * a wrong permission.
 */
export const LIVE_CLASS_SCREEN_SHARE_TOPIC = "screen_share_request";

export const screenShareRequestEventSchema = z.object({
  type: z.enum(["REQUESTED", "RESOLVED"]),
  entry: z.object({
    id: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    avatarUrl: z.string().nullable(),
    status: screenShareRequestStatusSchema,
    requestedAt: z.string(),
  }),
});

export type ScreenShareRequestEvent = z.infer<typeof screenShareRequestEventSchema>;
