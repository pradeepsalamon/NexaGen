import { z } from "zod";

// Coaches never create or move classes themselves; they ask, and an admin's
// approval is what creates the extra class or moves the scheduled one.
//
// Since Stage 5 of docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md these are
// approval-engine actions (`CLASS_EXTRA`, `CLASS_RESCHEDULE`, see approvals.ts):
// the coach sends `POST /approvals` with one of the payloads below. The old
// `class_change_requests` table is frozen history; its rows were copied into
// `approval_requests` with the same ids.

const timeWindow = {
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
};

const endsAfterStart = (v: { startsAt: string; endsAt: string }) =>
  new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime();
const endsAfterStartMessage = { message: "End time must be after start time.", path: ["endsAt"] };

/** `CLASS_EXTRA`: a new class for one of the coach's batches. */
export const classExtraPayloadSchema = z
  .object({
    batchId: z.string().trim().min(1).max(64),
    ...timeWindow,
    topic: z.string().trim().max(120).optional(),
  })
  .refine(endsAfterStart, endsAfterStartMessage);
export type ClassExtraPayload = z.infer<typeof classExtraPayloadSchema>;

/** `CLASS_RESCHEDULE`: move one of the coach's scheduled classes. */
export const classReschedulePayloadSchema = z
  .object({
    classId: z.string().trim().min(1).max(64),
    ...timeWindow,
  })
  .refine(endsAfterStart, endsAfterStartMessage);
export type ClassReschedulePayload = z.infer<typeof classReschedulePayloadSchema>;

/**
 * What the API stores for these actions, so the inbox can show "from → to".
 * `requestedValue` is the new time; `currentValue` (reschedule only) is the
 * class's time when the coach asked.
 */
export type ClassTimeValue = {
  startsAt: string;
  endsAt: string;
  topic?: string | null;
};

/** Reads a stored class time back out of an approval request's JSON, or null. */
export function readClassTimeValue(value: unknown): ClassTimeValue | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.startsAt !== "string" || typeof v.endsAt !== "string") return null;
  return {
    endsAt: v.endsAt,
    startsAt: v.startsAt,
    topic: typeof v.topic === "string" ? v.topic : null,
  };
}
