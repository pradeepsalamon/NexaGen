"use client";

import {
  STUDENT_ACTIVITY_OUTCOME_LABELS,
  STUDENT_ACTIVITY_OUTCOMES,
  STUDENT_ACTIVITY_TYPE_LABELS,
  STUDENT_ACTIVITY_TYPES,
  type StudentActivityStatusFilter,
  type StudentActivitySummary,
  type StudentActivityType
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  ACTIVITY_PERIOD_OPTIONS,
  activeFilterCount,
  type ActivityFilters,
  type ActivityPeriod
} from "../lib/activityFilters";

const STATUS_OPTIONS = [
  { label: "Completed (any result)", value: "COMPLETED" },
  ...STUDENT_ACTIVITY_OUTCOMES.map((value) => ({ label: STUDENT_ACTIVITY_OUTCOME_LABELS[value], value }))
];
const TYPE_OPTIONS = STUDENT_ACTIVITY_TYPES.map((value) => ({ label: STUDENT_ACTIVITY_TYPE_LABELS[value], value }));

/**
 * Period + type + group + class + assignment (+ status on the history tab).
 * The class / assignment / group lists come from the summary's facets, so they
 * only ever offer what this student has history in.
 */
export function ActivityFiltersBar({
  filters,
  onChange,
  facets,
  showStatus = false
}: {
  filters: ActivityFilters;
  onChange: (next: ActivityFilters) => void;
  facets: StudentActivitySummary["facets"] | undefined;
  showStatus?: boolean;
}) {
  const tz = useUserTimeZone();
  const set = (patch: Partial<ActivityFilters>) => onChange({ ...filters, ...patch });
  const selectClass = "min-h-10 w-full sm:w-auto sm:min-w-44";

  const classOptions = (facets?.classes ?? []).map((c) => ({
    label: `${c.title ?? "Class"} · ${formatFullDate(c.startsAt, tz)}`,
    value: c.id
  }));
  const assignmentOptions = (facets?.assignments ?? []).map((a) => ({ label: a.title, value: a.id }));
  const batchOptions = (facets?.batches ?? []).map((b) => ({ label: b.name, value: b.id }));
  const extra = activeFilterCount(filters) - (showStatus ? 0 : filters.status ? 1 : 0);

  return (
    <div aria-label="Activity filters" className="flex flex-col gap-3" role="group">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          aria-label="Time period"
          className={selectClass}
          onChange={(e) => set({ period: e.target.value as ActivityPeriod })}
          options={ACTIVITY_PERIOD_OPTIONS}
          value={filters.period}
        />
        {filters.period === "custom" ? (
          <>
            <DateStringPicker
              aria-label="From date"
              className="w-full sm:w-44"
              onChange={(from) => set({ from })}
              placeholder="From"
              value={filters.from}
            />
            <DateStringPicker
              aria-label="To date"
              className="w-full sm:w-44"
              onChange={(to) => set({ to })}
              placeholder="To"
              value={filters.to}
            />
          </>
        ) : null}
        <Select
          aria-label="Activity type"
          className={selectClass}
          onChange={(e) => set({ type: (e.target.value || undefined) as StudentActivityType | undefined })}
          options={TYPE_OPTIONS}
          placeholder="All activity types"
          value={filters.type ?? ""}
        />
        {showStatus ? (
          <Select
            aria-label="Result"
            className={selectClass}
            onChange={(e) =>
              set({ status: (e.target.value || undefined) as StudentActivityStatusFilter | undefined })
            }
            options={STATUS_OPTIONS}
            placeholder="Any result"
            value={filters.status ?? ""}
          />
        ) : null}
        {batchOptions.length > 1 || filters.batchId ? (
          <Select
            aria-label="Group"
            className={selectClass}
            onChange={(e) => set({ batchId: e.target.value || undefined })}
            options={batchOptions}
            placeholder="All groups"
            value={filters.batchId ?? ""}
          />
        ) : null}
        {classOptions.length > 0 || filters.classId ? (
          <Select
            aria-label="Live class"
            className={selectClass}
            onChange={(e) => set({ classId: e.target.value || undefined })}
            options={classOptions}
            placeholder="All classes"
            value={filters.classId ?? ""}
          />
        ) : null}
        {assignmentOptions.length > 0 || filters.assignmentId ? (
          <Select
            aria-label="Assignment"
            className={selectClass}
            onChange={(e) => set({ assignmentId: e.target.value || undefined })}
            options={assignmentOptions}
            placeholder="All assignments"
            value={filters.assignmentId ?? ""}
          />
        ) : null}
        {extra > 0 ? (
          <Button
            onClick={() =>
              onChange({
                ...filters,
                assignmentId: undefined,
                batchId: undefined,
                classId: undefined,
                status: undefined,
                type: undefined
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
