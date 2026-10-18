import { z } from "zod";

// How a class is taught: a group, one-on-one, or a pair of students ("buddy").
//
// Three layers, last non-empty wins:
//   1. derived from the roster size (1 → INDIVIDUAL, 2 → BUDDY, else GROUP)
//   2. `Batch.batchType`        — admin default for every class of the batch
//   3. `CoachClass.batchType`   — one class only (the coach's dashboard edit)
// A per-class edit never touches the batch or any sibling class.

export const batchTypeSchema = z.enum(["GROUP", "INDIVIDUAL", "BUDDY"]);
export type BatchType = z.infer<typeof batchTypeSchema>;

export const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  BUDDY: "Buddy",
  GROUP: "Group",
  INDIVIDUAL: "Individual"
};

export const BATCH_TYPE_OPTIONS: Array<{ label: string; value: BatchType }> = [
  { label: BATCH_TYPE_LABELS.GROUP, value: "GROUP" },
  { label: BATCH_TYPE_LABELS.INDIVIDUAL, value: "INDIVIDUAL" },
  { label: BATCH_TYPE_LABELS.BUDDY, value: "BUDDY" }
];

/** Where a resolved batch type came from — the UI says "auto" for `ROSTER`. */
export type BatchTypeSource = "CLASS" | "BATCH" | "ROSTER";

export function deriveBatchType(studentCount: number): BatchType {
  if (studentCount === 1) return "INDIVIDUAL";
  if (studentCount === 2) return "BUDDY";
  return "GROUP";
}

export function resolveBatchType(input: {
  batchDefault?: BatchType | null;
  classOverride?: BatchType | null;
  studentCount: number;
}): { source: BatchTypeSource; type: BatchType } {
  if (input.classOverride) return { source: "CLASS", type: input.classOverride };
  if (input.batchDefault) return { source: "BATCH", type: input.batchDefault };
  return { source: "ROSTER", type: deriveBatchType(input.studentCount) };
}
