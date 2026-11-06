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
import { DateStringPicker } from "@/components/ui/DatePicker";
import { FilterChips, FilterField, FilterPopover, type ActiveFilter } from "@/components/ui/FilterPopover";
import { Select } from "@/components/ui/Select";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  ACTIVITY_PERIOD_OPTIONS,
  type ActivityFilters,
  type ActivityPeriod
} from "../lib/activityFilters";

const STATUS_OPTIONS = [
  { label: "Completed (any result)", value: "COMPLETED" },
  ...STUDENT_ACTIVITY_OUTCOMES.map((value) => ({ label: STUDENT_ACTIVITY_OUTCOME_LABELS[value], value }))
];
const TYPE_OPTIONS = STUDENT_ACTIVITY_TYPES.map((value) => ({ label: STUDENT_ACTIVITY_TYPE_LABELS[value], value }));

/**
 * Period stays visible; type, group, class, assignment (+ status on the history
 * tab) live behind one Filters button, with the active ones as chips.
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

  const classOptions = (facets?.classes ?? []).map((c) => ({
    label: `${c.title ?? "Class"} · ${formatFullDate(c.startsAt, tz)}`,
    value: c.id
  }));
  const assignmentOptions = (facets?.assignments ?? []).map((a) => ({ label: a.title, value: a.id }));
  const batchOptions = (facets?.batches ?? []).map((b) => ({ label: b.name, value: b.id }));
  const label = (options: { label: string; value: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;
  const cleared: ActivityFilters = {
    ...filters,
    assignmentId: undefined,
    batchId: undefined,
    classId: undefined,
    status: undefined,
    type: undefined
  };
  const chips: ActiveFilter[] = [
    filters.type && { key: "type", label: STUDENT_ACTIVITY_TYPE_LABELS[filters.type], onRemove: () => set({ type: undefined }) },
    showStatus && filters.status && { key: "status", label: label(STATUS_OPTIONS, filters.status), onRemove: () => set({ status: undefined }) },
    filters.batchId && { key: "batch", label: label(batchOptions, filters.batchId), onRemove: () => set({ batchId: undefined }) },
    filters.classId && { key: "class", label: label(classOptions, filters.classId), onRemove: () => set({ classId: undefined }) },
    filters.assignmentId && { key: "assignment", label: label(assignmentOptions, filters.assignmentId), onRemove: () => set({ assignmentId: undefined }) },
  ].filter((chip): chip is ActiveFilter => Boolean(chip));

  return (
    <div aria-label="Activity filters" className="flex flex-col gap-2" role="group">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          aria-label="Time period"
          className="min-w-0 flex-1 sm:w-auto sm:min-w-44 sm:flex-none"
          onChange={(e) => set({ period: e.target.value as ActivityPeriod })}
          options={ACTIVITY_PERIOD_OPTIONS}
          value={filters.period}
        />
        <FilterPopover activeCount={chips.length} emptyValue={cleared} onApply={onChange} value={filters}>
          {(draft, update) => (
            <>
              <FilterField htmlFor="activity-filter-type" label="Activity type">
                <Select
                  id="activity-filter-type"
                  onChange={(e) => update({ type: (e.target.value || undefined) as StudentActivityType | undefined })}
                  options={TYPE_OPTIONS}
                  placeholder="All activity types"
                  value={draft.type ?? ""}
                />
              </FilterField>
              {showStatus ? (
                <FilterField htmlFor="activity-filter-status" label="Result">
                  <Select
                    id="activity-filter-status"
                    onChange={(e) =>
                      update({ status: (e.target.value || undefined) as StudentActivityStatusFilter | undefined })
                    }
                    options={STATUS_OPTIONS}
                    placeholder="Any result"
                    value={draft.status ?? ""}
                  />
                </FilterField>
              ) : null}
              {batchOptions.length > 1 || draft.batchId ? (
                <FilterField htmlFor="activity-filter-group" label="Group">
                  <Select
                    id="activity-filter-group"
                    onChange={(e) => update({ batchId: e.target.value || undefined })}
                    options={batchOptions}
                    placeholder="All groups"
                    value={draft.batchId ?? ""}
                  />
                </FilterField>
              ) : null}
              {classOptions.length > 0 || draft.classId ? (
                <FilterField htmlFor="activity-filter-class" label="Live class">
                  <Select
                    id="activity-filter-class"
                    onChange={(e) => update({ classId: e.target.value || undefined })}
                    options={classOptions}
                    placeholder="All classes"
                    value={draft.classId ?? ""}
                  />
                </FilterField>
              ) : null}
              {assignmentOptions.length > 0 || draft.assignmentId ? (
                <FilterField htmlFor="activity-filter-assignment" label="Assignment">
                  <Select
                    id="activity-filter-assignment"
                    onChange={(e) => update({ assignmentId: e.target.value || undefined })}
                    options={assignmentOptions}
                    placeholder="All assignments"
                    value={draft.assignmentId ?? ""}
                  />
                </FilterField>
              ) : null}
            </>
          )}
        </FilterPopover>
      </div>
      {filters.period === "custom" ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
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
        </div>
      ) : null}
      <FilterChips filters={chips} onClearAll={chips.length > 1 ? () => onChange(cleared) : undefined} />
    </div>
  );
}
