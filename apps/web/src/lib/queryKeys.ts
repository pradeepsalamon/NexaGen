import type { TrashListRequest } from "@nexa-gen/types";

export const queryKeys = {
  auth: {
    session: ["auth", "session"] as const,
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
} as const;
