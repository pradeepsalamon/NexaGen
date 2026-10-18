import { z } from "zod";

import type { AssignmentActivityType, PaginationMeta, PuzzleType } from "./index";

// ──────────────────────────────────────────────────────────────
// Course library — shared contract
// ──────────────────────────────────────────────────────────────
// A course is a curated, ordered playlist of EXISTING library content — each
// CourseModule references an Assignment or a Puzzle, never new authored
// content. Admin-authored only (no coach/visibility scoping, unlike Puzzle).
// Students see PUBLISHED courses; module completion is tracked explicitly
// (StudentModuleProgress) and rolls up into Course-level progressPercent.

export const courseStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseModuleContentTypeSchema = z.enum(["ASSIGNMENT", "PUZZLE"]);
export type CourseModuleContentType = z.infer<typeof courseModuleContentTypeSchema>;

// ── Course CRUD (admin) ──

const courseTitleSchema = z.string().trim().min(1).max(200);

export const createCourseRequestSchema = z.object({
  title: courseTitleSchema,
  description: z.string().trim().max(2000).optional()
});
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;

export const updateCourseRequestSchema = z.object({
  title: courseTitleSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional()
});
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;

export const setCoursePublishedRequestSchema = z.object({ published: z.boolean() });
export type SetCoursePublishedRequest = z.infer<typeof setCoursePublishedRequestSchema>;

export const setCourseArchivedRequestSchema = z.object({ archived: z.boolean() });
export type SetCourseArchivedRequest = z.infer<typeof setCourseArchivedRequestSchema>;

/** Query params for the paginated admin course list. */
export const courseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  status: courseStatusSchema.optional()
});
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;

// ── Modules (admin) ──

export const attachCourseModuleRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    contentType: courseModuleContentTypeSchema,
    assignmentId: z.string().min(1).optional(),
    puzzleId: z.string().min(1).optional()
  })
  .superRefine((v, ctx) => {
    const hasRef = v.contentType === "ASSIGNMENT" ? v.assignmentId : v.puzzleId;
    if (!hasRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.contentType === "ASSIGNMENT" ? "assignmentId" : "puzzleId"],
        message: "Required for this content type."
      });
    }
  });
export type AttachCourseModuleRequest = z.infer<typeof attachCourseModuleRequestSchema>;

export const updateCourseModuleRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional()
});
export type UpdateCourseModuleRequest = z.infer<typeof updateCourseModuleRequestSchema>;

export const reorderCourseModulesRequestSchema = z.object({
  moduleIds: z.array(z.string().min(1)).min(1)
});
export type ReorderCourseModulesRequest = z.infer<typeof reorderCourseModulesRequestSchema>;

// ── Response shapes (dates as ISO strings) ──

export type CourseModuleContentRef =
  | {
      assignment: { id: string; title: string; activityType: AssignmentActivityType; pgn: string };
      puzzle: null;
    }
  | { assignment: null; puzzle: { id: string; title: string; puzzleType: PuzzleType } };

export type CourseModuleSummary = {
  id: string;
  title: string;
  order: number;
  contentType: CourseModuleContentType;
} & CourseModuleContentRef;

export type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  moduleCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type CourseDetail = CourseSummary & { modules: CourseModuleSummary[] };

export type CourseListResponse = { courses: CourseSummary[]; pagination?: PaginationMeta };
export type CourseResponse = { course: CourseDetail };
export type CourseModuleResponse = { module: CourseModuleSummary };

// ── Student ──

export type StudentCourseModuleSummary = CourseModuleSummary & { completed: boolean };

export type StudentCourseSummary = {
  id: string;
  title: string;
  description: string | null;
  moduleCount: number;
  completedModuleCount: number;
  progressPercent: number;
  lastOpenedAt: string | null;
};

export type StudentCourseListResponse = { courses: StudentCourseSummary[] };
export type StudentCourseDetailResponse = {
  course: StudentCourseSummary & { modules: StudentCourseModuleSummary[] };
};
export type CompleteCourseModuleResponse = {
  completed: true;
  progressPercent: number;
};
