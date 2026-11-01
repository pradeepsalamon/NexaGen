import { z } from "zod";

// ──────────────────────────────────────────────
// In-app presence + coach "pull into class"
// ──────────────────────────────────────────────

/** How often a signed-in tab pings `/presence/heartbeat`. */
export const PRESENCE_HEARTBEAT_MS = 15_000;
/** A user counts as online (inside the app) if seen within this window. */
export const PRESENCE_ONLINE_WINDOW_MS = 45_000;

/** The class live right now for one of the student's batches. */
export interface PresenceLiveClass {
  classId: string;
  topic: string;
  coachName: string;
  startedAt: string | null;
}

/** A coach asked this student to join; the app takes them straight in. */
export interface PresencePull {
  id: string;
  classId: string;
  topic: string;
  coachName: string;
  requestedAt: string;
}

export interface PresenceHeartbeatResponse {
  /** A student's live class, or a coach's own; null for other roles. */
  liveClass: PresenceLiveClass | null;
  pull: PresencePull | null;
}

export type LiveClassPullStatus = "PENDING" | "JOINED" | "CANCELLED";

export interface PullRosterStudent {
  studentId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  /** Has the app open right now (any page). */
  online: boolean;
  lastSeenAt: string | null;
  /** Connected to this class's room. */
  inClass: boolean;
  /** Enrolled in the class's batch (others came from a search or an earlier pull). */
  inBatch: boolean;
  pull: { status: LiveClassPullStatus; requestedAt: string } | null;
  /**
   * V4: a coach may pull only students of their own batches. Anyone else needs
   * an approved `LIVE_CLASS_GUEST_STUDENT` request first; until then this is
   * true (and presence isn't shown). Always false for an admin.
   */
  needsApproval: boolean;
  /** A guest request for this student and class is waiting for an admin. */
  approvalPending: boolean;
}

export interface PullRosterResponse {
  students: PullRosterStudent[];
}

export const pullStudentRequestSchema = z.object({
  studentId: z.string().trim().min(1, "Student is required.")
});

export type PullStudentRequest = z.infer<typeof pullStudentRequestSchema>;
