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
  "PuzzleTopic"
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
  "puzzles",
  "studentBatches",
  "students"
]);

export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete-filter",
  query: {
    $allModels: {
      async $allOperations({ args, model, operation, query }) {
        const queryArgs = args as QueryArgs | undefined;
        const includeDeleted = Boolean(queryArgs?.includeDeleted);

        if (queryArgs && "includeDeleted" in queryArgs) {
          delete queryArgs.includeDeleted;
        }

        if (
          !includeDeleted &&
          readOperations.has(operation) &&
          trashableModelNames.has(model)
        ) {
          applySoftDeleteFilter(queryArgs);
        }

        return query(args);
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

function applySoftDeleteFilter(args: QueryArgs | undefined) {
  if (!args) {
    return;
  }

  args.where = addIsDeletedFalse(args.where);
  addRelationFilters(args.include);
  addRelationFilters(args.select);
}

function addRelationFilters(record: Record<string, unknown> | undefined) {
  if (!record) {
    return;
  }

  for (const [relationName, relationValue] of Object.entries(record)) {
    const relationModel = relationToModel[relationName];

    if (
      !relationModel ||
      !filterableRelationNames.has(relationName) ||
      relationValue === false
    ) {
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
    addRelationFilters(relationArgs.include);
    addRelationFilters(relationArgs.select);
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
