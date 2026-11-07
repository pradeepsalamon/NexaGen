/**
 * Soft-delete query extension.
 *
 * Read operations (`findMany`, `findFirst`, `findUnique`, `count`, `aggregate`,
 * `groupBy`, ...) on the models listed in `softDeleteModels` get
 * `isDeleted: false` injected into `where`, and the relations listed in
 * `filterableRelationNames` get the same filter applied to their nested
 * `include`/`select` args. Writes are never touched.
 *
 * Escape hatch: pass `includeDeleted: true` in the query args to skip the
 * injection for that single call. The flag is stripped before the query reaches
 * Prisma, so it never appears in the generated SQL. For a client where every
 * call bypasses the filter, use `prisma.withDeleted` (`PrismaService`) instead.
 *
 * Uniqueness pre-checks MUST use `prisma.withDeleted`. Columns such as
 * `users.email` and `users.username` are uniquely indexed across soft-deleted
 * rows, so a filtered read misses a conflicting deleted row and the subsequent
 * write fails with P2002 as an unhandled 500. See `docs/PROJECT_RULES.md` §4.6.
 */
import { Prisma } from "@prisma/client";

type QueryArgs = {
  include?: Record<string, unknown>;
  includeDeleted?: boolean;
  select?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

export const softDeleteModels = [
  "User",
  "StudentProfile",
  "CoachProfile",
  "Batch",
  "BatchCoach",
  "BatchStudent",
  "Puzzle",
  "PuzzleTopic",
  "LibraryActivity",
  "Course",
  "CourseModule",
  "Assignment",
  "Announcement",
  "Lead",
  "FeedbackForm",
  "KnowledgeArticle",
  "KnowledgeCategory",
  "ChessGame",
  "LiveClassPreset",
  "DemoSchedule"
] as const;

export type SoftDeleteModel = (typeof softDeleteModels)[number];
export type TrashAction =
  | "SOFT_DELETE"
  | "RESTORE"
  | "PERMANENT_DELETE"
  | "AUTOMATIC_CLEANUP";

export const trashEntities = [
  {
    delegate: "batchCoach",
    label: "BatchCoach",
    searchFields: [],
    titleField: "id"
  },
  {
    delegate: "batchStudent",
    label: "BatchStudent",
    searchFields: [],
    titleField: "id"
  },
  {
    delegate: "studentProfile",
    label: "StudentProfile",
    searchFields: ["parentName", "parentEmail", "parentPhone"],
    titleField: "parentName"
  },
  {
    delegate: "coachProfile",
    label: "CoachProfile",
    searchFields: ["bio", "qualification", "specialization", "fideId"],
    titleField: "qualification"
  },
  {
    delegate: "batch",
    label: "Batch",
    searchFields: ["name", "description", "scheduleNotes"],
    titleField: "name"
  },
  {
    delegate: "user",
    label: "User",
    searchFields: ["email", "firstName", "lastName", "username"],
    titleField: "email"
  },
  {
    delegate: "puzzle",
    label: "Puzzle",
    searchFields: ["title", "description"],
    titleField: "title"
  },
  {
    delegate: "puzzleTopic",
    label: "PuzzleTopic",
    searchFields: ["name", "description"],
    titleField: "name"
  },
  {
    delegate: "libraryActivity",
    label: "LibraryActivity",
    searchFields: ["title", "description"],
    titleField: "title"
  },
  {
    delegate: "course",
    label: "Course",
    searchFields: ["title", "description"],
    titleField: "title"
  },
  {
    delegate: "courseModule",
    label: "CourseModule",
    searchFields: ["title"],
    titleField: "title"
  },
  {
    delegate: "assignment",
    label: "Assignment",
    searchFields: ["title", "description"],
    titleField: "title"
  },
  {
    delegate: "announcement",
    label: "Announcement",
    searchFields: ["title"],
    titleField: "title"
  },
  {
    delegate: "lead",
    label: "Lead",
    searchFields: ["studentName", "parentName", "email", "phone"],
    titleField: "studentName"
  },
  {
    delegate: "feedbackForm",
    label: "FeedbackForm",
    searchFields: ["title"],
    titleField: "title"
  },
  {
    delegate: "knowledgeArticle",
    label: "KnowledgeArticle",
    searchFields: ["slug"],
    titleField: "slug"
  },
  {
    delegate: "knowledgeCategory",
    label: "KnowledgeCategory",
    searchFields: ["name"],
    titleField: "name"
  },
  {
    delegate: "chessGame",
    label: "ChessGame",
    searchFields: ["title"],
    titleField: "title"
  },
  {
    delegate: "liveClassPreset",
    label: "LiveClassPreset",
    searchFields: ["name"],
    titleField: "name"
  },
  {
    delegate: "demoSchedule",
    label: "DemoSchedule",
    searchFields: ["topic", "slug"],
    titleField: "topic"
  }
] as const;

export type TrashEntity = (typeof trashEntities)[number]["label"];

const readOperations = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy"
]);

const delegateToModel = new Map<string, TrashEntity>(
  trashEntities.map((entity) => [entity.delegate, entity.label])
);

const relationToModel: Record<string, SoftDeleteModel> = {
  approvedBy: "User",
  approvedCoaches: "CoachProfile",
  batch: "Batch",
  coachedBatches: "BatchCoach",
  coaches: "BatchCoach",
  coach: "User",
  coachProfile: "CoachProfile",
  createdBatches: "Batch",
  createdBy: "User",
  createdUsers: "User",
  deletedBy: "User",
  modules: "CourseModule",
  puzzles: "Puzzle",
  student: "User",
  studentBatches: "BatchStudent",
  studentProfile: "StudentProfile",
  students: "BatchStudent",
  topic: "PuzzleTopic",
  user: "User"
};

const trashableModelNames = new Set<string>(softDeleteModels);
const filterableRelationNames = new Set([
  "approvedCoaches",
  "coachedBatches",
  "coaches",
  "createdBatches",
  "createdUsers",
  "modules",
  "puzzles",
  "studentBatches",
  "students"
]);

/**
 * Rows hidden because their parent is in the trash, though they have no `isDeleted` of their
 * own: an assignment's deployments and each student's copy go with it (`Assignment` cascades
 * to both, so this matches what a permanent delete removes).
 */
const parentScopedWhere: Record<string, Record<string, unknown>> = {
  AssignmentBatch: { assignment: { isDeleted: false } },
  StudentAssignment: { assignmentBatch: { assignment: { isDeleted: false } } }
};

/** The extension's work on one query's args (mutates and returns them). */
export function applySoftDeleteArgs<T>(model: string, operation: string, args: T): T {
  const queryArgs = args as QueryArgs | undefined;
  const includeDeleted = Boolean(queryArgs?.includeDeleted);

  if (queryArgs && "includeDeleted" in queryArgs) {
    delete queryArgs.includeDeleted;
  }

  if (!includeDeleted && readOperations.has(operation) && trashableModelNames.has(model)) {
    applySoftDeleteFilter(model, queryArgs);
  }

  const parentScope = parentScopedWhere[model];
  if (!includeDeleted && readOperations.has(operation) && parentScope && queryArgs) {
    // Appended to AND, so a findUnique keeps its unique key at the top level.
    const where = queryArgs.where ?? {};
    const existingAnd = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
    queryArgs.where = { ...where, AND: [...existingAnd, parentScope] };
  }

  return args;
}

export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete-filter",
  query: {
    $allModels: {
      async $allOperations({ args, model, operation, query }) {
        return query(applySoftDeleteArgs(model, operation, args));
      }
    }
  }
});

export function getTrashEntity(entity: string) {
  return trashEntities.find(
    (trashEntity) => trashEntity.label.toLowerCase() === entity.toLowerCase()
  );
}

export function getTrashEntityByDelegate(delegate: string) {
  return delegateToModel.get(delegate);
}

function applySoftDeleteFilter(model: string, args: QueryArgs | undefined) {
  if (!args) {
    return;
  }

  args.where = addIsDeletedFalse(args.where);
  addRelationFilters(model, args.include);
  addRelationFilters(model, args.select);
}

/**
 * Prisma's own schema: `Model.field` → the related model, for list relations only. A relation
 * name alone is ambiguous (`PuzzleTopic.puzzles` is Puzzle, `Assignment.puzzles` is
 * AssignmentPuzzle, which has no `isDeleted`), so a nested filter checks the real target.
 */
const listRelationTargets = new Map<string, string>(
  Prisma.dmmf.datamodel.models.flatMap((dmmfModel) =>
    dmmfModel.fields
      .filter((field) => field.kind === "object" && field.isList)
      .map((field) => [`${dmmfModel.name}.${field.name}`, field.type] as [string, string])
  )
);

/** Trash models added after the name-based list: every list relation to one of them is filtered. */
const filterAnyListRelationTo = new Set<string>([
  "Assignment",
  "Announcement",
  "Lead",
  "FeedbackForm",
  "KnowledgeArticle",
  "KnowledgeCategory",
  "ChessGame",
  "LiveClassPreset",
  "DemoSchedule"
]);

function addRelationFilters(model: string, record: Record<string, unknown> | undefined) {
  if (!record) {
    return;
  }

  for (const [relationName, relationValue] of Object.entries(record)) {
    const target = listRelationTargets.get(`${model}.${relationName}`);
    const relationModel = target && trashableModelNames.has(target) ? target : undefined;
    const filterable =
      relationModel !== undefined &&
      (filterAnyListRelationTo.has(relationModel) ||
        (filterableRelationNames.has(relationName) && relationToModel[relationName] === relationModel));

    if (!relationModel || !filterable || relationValue === false) {
      continue;
    }

    if (relationValue === true) {
      record[relationName] = {
        where: { isDeleted: false }
      };
      continue;
    }

    if (typeof relationValue !== "object" || relationValue === null) {
      continue;
    }

    const relationArgs = relationValue as QueryArgs;
    relationArgs.where = addIsDeletedFalse(relationArgs.where);
    addRelationFilters(relationModel, relationArgs.include);
    addRelationFilters(relationModel, relationArgs.select);
  }
}

function addIsDeletedFalse(where: Record<string, unknown> | undefined) {
  if (!where) {
    return { isDeleted: false };
  }

  if ("isDeleted" in where) {
    return where;
  }

  return {
    ...where,
    isDeleted: false
  };
}
