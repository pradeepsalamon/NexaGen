import { z } from "zod";

// Admin-approval engine contract (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
// §2.3). One generic request shape for every module: the API's handler for an
// `actionType` validates `payload`, snapshots the current state, re-checks the
// requester at approval and performs the change. Add an action here AND a
// handler in `apps/api/src/approval/handlers/` (a spec checks they match).

export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalCategorySchema = z.enum([
  "LIVE_CLASS",
  "SCHEDULING",
  "ENROLMENT",
  "ATTENDANCE",
  "COACHING",
  "FINANCE",
]);
export type ApprovalCategory = z.infer<typeof approvalCategorySchema>;

export const APPROVAL_CATEGORY_LABELS: Record<ApprovalCategory, string> = {
  LIVE_CLASS: "Live classes",
  SCHEDULING: "Scheduling",
  ENROLMENT: "Students & enrolment",
  ATTENDANCE: "Attendance",
  COACHING: "Coach assignments",
  FINANCE: "Payments & finance",
};

type ApprovalRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

export interface ApprovalActionMeta {
  category: ApprovalCategory;
  label: string;
  /** Who may ask. */
  requesterRoles: readonly ApprovalRole[];
  /** Who may decide (never the requester — enforced by the API and a DB CHECK). */
  reviewerRoles: readonly ApprovalRole[];
  /** Default lifetime; a handler may expire a request sooner (e.g. at class start). */
  defaultTtlHours: number;
}

const ADMINS = ["ADMIN", "SUPER_ADMIN"] as const;

/**
 * The action catalogue. Only actions with a registered API handler can be
 * requested; the list grows stage by stage (plan §5).
 */
export const APPROVAL_ACTIONS = {
  CLASS_CANCEL: {
    category: "SCHEDULING",
    label: "Cancel a class within 24 hours of its start",
    requesterRoles: ["COACH"],
    reviewerRoles: ADMINS,
    defaultTtlHours: 24,
  },
  CLASS_EXTRA: {
    category: "SCHEDULING",
    label: "Add an extra class",
    requesterRoles: ["COACH"],
    reviewerRoles: ADMINS,
    // Plan D2 default; the handler expires it sooner at the class start.
    defaultTtlHours: 72,
  },
  CLASS_RESCHEDULE: {
    category: "SCHEDULING",
    label: "Reschedule a class",
    requesterRoles: ["COACH"],
    reviewerRoles: ADMINS,
    defaultTtlHours: 72,
  },
  CLASS_CANCEL_EXCEPTIONAL: {
    category: "SCHEDULING",
    label: "Cancel a class after it started",
    requesterRoles: ["COACH"],
    reviewerRoles: ADMINS,
    defaultTtlHours: 72,
  },
  LIVE_CLASS_GUEST_STUDENT: {
    category: "LIVE_CLASS",
    label: "Let a student from outside my batches join my class",
    requesterRoles: ["COACH"],
    reviewerRoles: ADMINS,
    defaultTtlHours: 24,
  },
} as const satisfies Record<string, ApprovalActionMeta>;

export type ApprovalActionType = keyof typeof APPROVAL_ACTIONS;
export const APPROVAL_ACTION_TYPES = Object.keys(APPROVAL_ACTIONS) as ApprovalActionType[];
export const approvalActionTypeSchema = z.enum(
  APPROVAL_ACTION_TYPES as [ApprovalActionType, ...ApprovalActionType[]],
);

// ── Requests ──

export const createApprovalRequestSchema = z.object({
  actionType: approvalActionTypeSchema,
  /** Validated by the action's handler (its own Zod schema). */
  payload: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(3, "Give a short reason.").max(1000),
  urgent: z.boolean().optional(),
});
export type CreateApprovalRequest = z.infer<typeof createApprovalRequestSchema>;

export const decideApprovalRequestSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type DecideApprovalRequest = z.infer<typeof decideApprovalRequestSchema>;

export const rejectApprovalRequestSchema = z.object({
  reason: z.string().trim().min(3, "Tell the requester why.").max(1000),
});
export type RejectApprovalRequest = z.infer<typeof rejectApprovalRequestSchema>;

export const approvalListQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
  category: approvalCategorySchema.optional(),
  actionType: approvalActionTypeSchema.optional(),
  requesterId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  urgent: z.enum(["true", "false"]).optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

// ── Responses ──

export type ApprovalEventType =
  | "CREATED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "REVALIDATION_FAILED";

export type ApprovalEventDto = {
  id: string;
  type: ApprovalEventType;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ApprovalRequestDto = {
  id: string;
  category: ApprovalCategory;
  actionType: ApprovalActionType;
  actionLabel: string;
  status: ApprovalStatus;
  requesterId: string | null;
  requesterName: string | null;
  requesterRole: ApprovalRole;
  batchId: string | null;
  batchName: string | null;
  classId: string | null;
  classTitle: string | null;
  subjectUserId: string | null;
  subjectUserName: string | null;
  currentValue: unknown;
  requestedValue: unknown;
  reason: string;
  details: unknown;
  urgent: boolean;
  expiresAt: string;
  reviewerName: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  /** Present on single-request reads. */
  events?: ApprovalEventDto[];
};

export type ApprovalRequestResponse = { request: ApprovalRequestDto };
export type ApprovalRequestListResponse = { requests: ApprovalRequestDto[] };

// ── Other review queues (Stage 5) ──
//
// Requests that keep their own tables and review flows but are listed in the
// same admin inbox (`/admin/requests`). Read-only here: each is still decided
// on its own page. The API returns only the queues the caller may review.

export const OTHER_REQUEST_QUEUE_KINDS = ["MANUAL_PAYMENT", "ACCOUNT_DELETION", "COACH_APPLICATION"] as const;
export type OtherRequestQueueKind = (typeof OTHER_REQUEST_QUEUE_KINDS)[number];

export const OTHER_REQUEST_QUEUE_LABELS: Record<OtherRequestQueueKind, string> = {
  MANUAL_PAYMENT: "Offline payments to confirm",
  ACCOUNT_DELETION: "Account deletion requests",
  COACH_APPLICATION: "Coach applications",
};

export type OtherRequestQueueItem = {
  id: string;
  /** Who or what it's about, e.g. the student and amount. */
  title: string;
  subtitle: string | null;
  createdAt: string;
};

export type OtherRequestQueue = {
  kind: OtherRequestQueueKind;
  label: string;
  pendingCount: number;
  /** The oldest few waiting, oldest first. */
  items: OtherRequestQueueItem[];
};

export type OtherRequestQueuesResponse = { queues: OtherRequestQueue[] };
