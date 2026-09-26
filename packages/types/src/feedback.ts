import { z } from "zod";

// Coach feedback & ratings. An admin authors a `FeedbackForm` — its questions,
// WHEN it is asked (`trigger`) and WHERE a student sees it (`placements`).
// Students answer it about a specific coach; RATING answers roll up into that
// coach's rating. "Pending" is computed server-side on read; a submitted or
// skipped response is what closes one.

export const FEEDBACK_RATING_MAX = 5;

export const feedbackQuestionTypeSchema = z.enum(["RATING", "TEXT", "SINGLE_CHOICE", "YES_NO"]);
export type FeedbackQuestionType = z.infer<typeof feedbackQuestionTypeSchema>;

export const FEEDBACK_QUESTION_TYPE_LABELS: Record<FeedbackQuestionType, string> = {
  RATING: "Star rating (1-5)",
  TEXT: "Written answer",
  SINGLE_CHOICE: "Multiple choice",
  YES_NO: "Yes / No"
};

export const feedbackTriggerSchema = z.enum(["AFTER_CLASS", "RECURRING", "ONE_TIME"]);
export type FeedbackTrigger = z.infer<typeof feedbackTriggerSchema>;

export const FEEDBACK_TRIGGER_LABELS: Record<FeedbackTrigger, string> = {
  AFTER_CLASS: "After classes",
  RECURRING: "Periodically",
  ONE_TIME: "Once"
};

export const feedbackPlacementSchema = z.enum(["CLASS_END", "DASHBOARD_POPUP", "DASHBOARD_CARD"]);
export type FeedbackPlacement = z.infer<typeof feedbackPlacementSchema>;

export const FEEDBACK_PLACEMENT_LABELS: Record<FeedbackPlacement, string> = {
  CLASS_END: "Class-ended screen",
  DASHBOARD_POPUP: "Dashboard pop-up",
  DASHBOARD_CARD: "Dashboard card"
};

export const FEEDBACK_PLACEMENT_DESCRIPTIONS: Record<FeedbackPlacement, string> = {
  CLASS_END: "Shown right on the summary screen when the coach ends a live class.",
  DASHBOARD_POPUP: "Opens as a dialog the next time the student visits their dashboard.",
  DASHBOARD_CARD: "A card at the top of the student dashboard until it's answered."
};

export const feedbackQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1, "Question text is required").max(300),
    type: feedbackQuestionTypeSchema,
    required: z.boolean(),
    // SINGLE_CHOICE only.
    options: z.array(z.string().trim().min(1, "Option cannot be empty").max(120)).max(10).optional()
  })
  .superRefine((question, ctx) => {
    if (question.type === "SINGLE_CHOICE" && (question.options?.length ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least two options",
        path: ["options"]
      });
    }
  });
export type FeedbackQuestion = z.infer<typeof feedbackQuestionSchema>;

export const upsertFeedbackFormRequestSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    description: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean(),
    questions: z
      .array(feedbackQuestionSchema)
      .min(1, "Add at least one question")
      .max(20)
      .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, "Question ids must be unique"),
    trigger: feedbackTriggerSchema,
    classInterval: z.number().int().min(1).max(50),
    intervalDays: z.number().int().min(1).max(365).optional().nullable(),
    expiresAfterDays: z.number().int().min(1).max(90),
    placements: z.array(feedbackPlacementSchema).min(1, "Pick at least one place to show it"),
    batchIds: z.array(z.string().min(1)).max(200),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    allowSkip: z.boolean(),
    showToCoach: z.boolean()
  })
  .superRefine((form, ctx) => {
    if (form.trigger === "RECURRING" && !form.intervalDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set how often to ask",
        path: ["intervalDays"]
      });
    }
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End must be after start",
        path: ["endsAt"]
      });
    }
  });
export type UpsertFeedbackFormRequest = z.infer<typeof upsertFeedbackFormRequestSchema>;

export interface FeedbackFormDto {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  questions: FeedbackQuestion[];
  trigger: FeedbackTrigger;
  classInterval: number;
  intervalDays: number | null;
  expiresAfterDays: number;
  placements: FeedbackPlacement[];
  batchIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  allowSkip: boolean;
  showToCoach: boolean;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormListResponse {
  forms: FeedbackFormDto[];
}

// ── Student ──

export const feedbackAnswerInputSchema = z.object({
  questionId: z.string().min(1).max(64),
  ratingValue: z.number().int().min(1).max(FEEDBACK_RATING_MAX).optional().nullable(),
  textValue: z.string().trim().max(2000).optional().nullable()
});
export type FeedbackAnswerInput = z.infer<typeof feedbackAnswerInputSchema>;

export const feedbackTargetSchema = z.object({
  formId: z.string().min(1),
  coachId: z.string().min(1),
  contextKey: z.string().min(1).max(120)
});
export type FeedbackTarget = z.infer<typeof feedbackTargetSchema>;

export const submitFeedbackRequestSchema = feedbackTargetSchema.extend({
  answers: z.array(feedbackAnswerInputSchema).max(20)
});
export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>;

export type SkipFeedbackRequest = FeedbackTarget;

/** One open request: answer `form` about `coach` (optionally for one class). */
export interface PendingFeedbackItem extends FeedbackTarget {
  formTitle: string;
  formDescription: string | null;
  questions: FeedbackQuestion[];
  placements: FeedbackPlacement[];
  allowSkip: boolean;
  coachName: string;
  classId: string | null;
  classTitle: string | null;
  classEndedAt: string | null;
  expiresAt: string | null;
}

export interface PendingFeedbackResponse {
  items: PendingFeedbackItem[];
}

export interface PendingFeedbackQuery {
  placement?: FeedbackPlacement;
  classId?: string;
}

// ── Ratings & responses ──

export interface FeedbackAnswerDto {
  questionId: string;
  questionLabel: string;
  questionType: FeedbackQuestionType;
  ratingValue: number | null;
  textValue: string | null;
}

export interface FeedbackResponseDto {
  id: string;
  formId: string;
  formTitle: string;
  coachId: string;
  coachName: string;
  /** Null in the coach's own view — coaches see feedback anonymously. */
  studentId: string | null;
  studentName: string | null;
  classId: string | null;
  classTitle: string | null;
  overallRating: number | null;
  answers: FeedbackAnswerDto[];
  createdAt: string;
}

export interface FeedbackResponseListResponse {
  responses: FeedbackResponseDto[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface FeedbackResponseListQuery {
  page?: number | string;
  pageSize?: number | string;
  formId?: string;
  coachId?: string;
}

export interface CoachRatingSummary {
  coachId: string;
  coachName: string;
  averageRating: number | null;
  responseCount: number;
  /** Count of responses whose rounded overall rating is 1..5 (index 0 = 1 star). */
  distribution: number[];
  lastResponseAt: string | null;
}

export interface CoachRatingsResponse {
  coaches: CoachRatingSummary[];
}

export interface QuestionRatingSummary {
  questionId: string;
  questionLabel: string;
  averageRating: number;
  count: number;
}

export interface MyCoachFeedbackResponse {
  summary: CoachRatingSummary;
  questions: QuestionRatingSummary[];
  recent: FeedbackResponseDto[];
}

/** Mean of the given 1-5 ratings to one decimal place, or null for none. */
export function averageRating(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean * 10) / 10;
}
