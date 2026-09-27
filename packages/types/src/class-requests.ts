import { z } from "zod";

// Coaches never create or move classes themselves; they ask, and an admin's
// approval is what creates the extra class or moves the scheduled one.

export const CLASS_REQUEST_TYPES = ["EXTRA_CLASS", "RESCHEDULE"] as const;
export const classRequestTypeSchema = z.enum(CLASS_REQUEST_TYPES);
export type ClassRequestType = z.infer<typeof classRequestTypeSchema>;

export const CLASS_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
export const classRequestStatusSchema = z.enum(CLASS_REQUEST_STATUSES);
export type ClassRequestStatus = z.infer<typeof classRequestStatusSchema>;

export const CLASS_REQUEST_TYPE_LABELS: Record<ClassRequestType, string> = {
  EXTRA_CLASS: "Extra class",
  RESCHEDULE: "Reschedule"
};

export const CLASS_REQUEST_STATUS_LABELS: Record<ClassRequestStatus, string> = {
  APPROVED: "Approved",
  PENDING: "Pending",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn"
};

export const createClassChangeRequestSchema = z
  .object({
    type: classRequestTypeSchema,
    /** EXTRA_CLASS: the batch it's for. Ignored for RESCHEDULE (taken from the class). */
    batchId: z.string().min(1).optional(),
    /** RESCHEDULE: the class to move. */
    classId: z.string().min(1).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    topic: z.string().trim().max(120).optional(),
    reason: z.string().trim().min(1, "Tell the admin why.").max(1000)
  })
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: "End time must be after start time.",
    path: ["endsAt"]
  })
  .refine((v) => (v.type === "EXTRA_CLASS" ? !!v.batchId : !!v.classId), {
    message: "Pick the batch (extra class) or the class (reschedule).",
    path: ["batchId"]
  });
export type CreateClassChangeRequest = z.infer<typeof createClassChangeRequestSchema>;

export const reviewClassChangeRequestSchema = z.object({
  note: z.string().trim().max(1000).optional()
});
export type ReviewClassChangeRequest = z.infer<typeof reviewClassChangeRequestSchema>;

export type ClassChangeRequestDto = {
  id: string;
  type: ClassRequestType;
  status: ClassRequestStatus;
  coachId: string;
  coachName: string;
  batchId: string;
  batchName: string;
  /** RESCHEDULE: the class being moved; EXTRA_CLASS: the class created on approval. */
  classId: string | null;
  /** RESCHEDULE only: the class's time when the request was made. */
  originalStartsAt: string | null;
  originalEndsAt: string | null;
  startsAt: string;
  endsAt: string;
  topic: string | null;
  reason: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type ClassChangeRequestListResponse = { requests: ClassChangeRequestDto[] };
export type ClassChangeRequestResponse = { request: ClassChangeRequestDto };
