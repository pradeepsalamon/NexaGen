import type {
  StudentActivityScope,
  StudentActivityStatusFilter,
  StudentActivityType
} from "@nexa-chess/types";

export type ActivityPeriod = "7" | "30" | "90" | "365" | "all" | "custom";

export const ACTIVITY_PERIOD_OPTIONS: { value: ActivityPeriod; label: string }[] = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 12 months", value: "365" },
  { label: "All time", value: "all" },
  { label: "Custom range", value: "custom" }
];

export type ActivityFilters = {
  period: ActivityPeriod;
  /** `YYYY-MM-DD`, custom period only. */
  from: string;
  to: string;
  type?: StudentActivityType;
  batchId?: string;
  classId?: string;
  assignmentId?: string;
  /** History only — the summary always covers every status. */
  status?: StudentActivityStatusFilter;
};

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = { from: "", period: "90", to: "" };

/** The calendar day `offsetDays` from today, in `timeZone`, as `YYYY-MM-DD`. */
export function dayIn(timeZone: string, offsetDays = 0): string {
  const base = new Date(Date.now() + offsetDays * 86_400_000);
  try {
    return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(base);
  } catch {
    return base.toISOString().slice(0, 10);
  }
}

/** Filters → the API scope: a preset period becomes concrete days in the viewer's zone. */
export function toActivityScope(filters: ActivityFilters, timeZone: string): StudentActivityScope {
  const scope: StudentActivityScope = {
    assignmentId: filters.assignmentId,
    batchId: filters.batchId,
    classId: filters.classId,
    type: filters.type
  };
  if (filters.period === "custom") {
    if (filters.from) scope.from = filters.from;
    if (filters.to) scope.to = filters.to;
    if (scope.from && scope.to && scope.from > scope.to) [scope.from, scope.to] = [scope.to, scope.from];
  } else if (filters.period !== "all") {
    scope.from = dayIn(timeZone, -(Number(filters.period) - 1));
    scope.to = dayIn(timeZone);
  }
  return scope;
}

export function activeFilterCount(filters: ActivityFilters): number {
  return [filters.type, filters.batchId, filters.classId, filters.assignmentId, filters.status].filter(Boolean).length;
}
