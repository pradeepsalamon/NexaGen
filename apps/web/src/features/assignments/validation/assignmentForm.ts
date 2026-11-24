import { assignmentActivityTypeSchema, MAX_ASSIGNMENT_PGN_LENGTH } from "@nexa-chess/types";
import { z } from "zod";

/** An optional whole number typed into a field: blank, or an integer in [min, max]. */
const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), {
      message: `${label} must be a whole number from ${min} to ${max}.`
    });

const requiredInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, {
      message: `${label} must be a whole number from ${min} to ${max}.`
    });

/**
 * The assignment form's client rules, mirroring `createAssignmentRequestSchema`
 * / `assignmentActivityConfigShape` in `@nexa-chess/types` (FE review F1;
 * UI_RULES §5: client limits mirror the API's). The fields stay strings as the
 * inputs hold them; the dialog converts on submit. The other fields (move
 * lists, puzzles, scoring) pass through untouched.
 */
export const assignmentFormSchema = z
  .object({
    activityType: assignmentActivityTypeSchema,
    description: z.string().max(2000, "Keep the instructions under 2,000 characters."),
    engineLevel: requiredInt(0, 20, "Engine level"),
    maxAttempts: optionalInt(1, 50, "Maximum attempts"),
    minMoves: optionalInt(1, 200, "Minimum moves"),
    passThresholdPercent: requiredInt(1, 100, "Pass threshold"),
    pgn: z.string().max(MAX_ASSIGNMENT_PGN_LENGTH, "PGN is too large."),
    puzzles: z.array(z.unknown()),
    solutionMoves: z.array(z.unknown()),
    timeLimitMinutes: optionalInt(1, 180, "Time limit"),
    title: z.string().trim().min(1, "Title is required.").max(200, "Keep the title under 200 characters.")
  })
  .passthrough()
  .superRefine((v, ctx) => {
    if (v.activityType === "REPLAY" && !v.pgn.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PGN is required.", path: ["pgn"] });
    }
    if (v.activityType === "SOLVE_LINE" && v.solutionMoves.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Record at least one solution move.", path: ["solutionMoves"] });
    }
    if (v.activityType === "PUZZLE_SET" && v.puzzles.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one puzzle.", path: ["puzzles"] });
    }
  });
