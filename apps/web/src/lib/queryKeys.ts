import type { TrashListRequest } from "@nexa-chess/types";

export const queryKeys = {
  auth: {
    // Must match the key SessionBootstrap / AuthLayout use, or invalidating it
    // is a no-op (AUDIT L3).
    session: ["auth", "me"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters?: Record<string, any>) => ["users", "list", filters] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },
  batches: {
    all: ["batches"] as const,
    list: (filters?: Record<string, any>) => ["batches", "list", filters] as const,
    detail: (id: string) => ["batches", "detail", id] as const,
    assignableUsers: ["batches", "assignable-users"] as const,
  },
  trash: {
    all: ["trash"] as const,
    list: (params: TrashListRequest) => ["trash", "list", params] as const,
  },
  coach: {
    dashboard: ["coach", "dashboard"] as const,
    batches: ["coach", "batches"] as const,
    classes: ["coach", "classes"] as const,
    upcomingClasses: ["coach", "classes", "upcoming"] as const,
    classHistory: ["coach", "classes", "history"] as const,
    classDetail: (id: string) => ["coach", "classes", "detail", id] as const,
    students: ["coach", "students"] as const,
  },
  admin: {
    base: ["admin"] as const,
  },
  attendance: {
    classSummary: (id: string) => ["attendance", "class-summary", id] as const,
  },
  assignments: {
    all: ["assignments"] as const,
    library: ["assignments", "library"] as const,
    libraryItem: (id: string) => ["assignments", "library", id] as const,
    deployments: ["assignments", "deployments"] as const,
    deployment: (id: string) => ["assignments", "deployments", id] as const,
    mine: ["assignments", "mine"] as const,
    mineItem: (id: string) => ["assignments", "mine", id] as const,
  },
} as const;
