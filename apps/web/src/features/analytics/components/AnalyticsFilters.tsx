"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { FilterChips, FilterField, FilterPopover, type ActiveFilter } from "@/components/ui/FilterPopover";
import { Select } from "@/components/ui/Select";

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "STUDENT", label: "Students" },
  { value: "COACH", label: "Coaches" },
  { value: "ADMIN", label: "Admins" }
];

const CLASS_TYPE_OPTIONS = [
  { value: "all", label: "All classes" },
  { value: "demo", label: "Demo classes" },
  { value: "batch", label: "Batch classes" }
];

const ACQUISITION_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "GOOGLE", label: "Google" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "SCHOOL", label: "School" },
  { value: "COACH_REFERRAL", label: "Coach referral" },
  { value: "ADVERTISEMENT", label: "Advertisement" },
  { value: "OTHER", label: "Other" },
  { value: "UNKNOWN", label: "Unknown" }
];

type Filters = Pick<AnalyticsRangeQuery, "acquisitionSource" | "classType" | "role">;
const EMPTY: Filters = { acquisitionSource: undefined, classType: "all", role: undefined };
const labelOf = (options: { label: string; value: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/** Role, class type and acquisition source behind one Filters button, the active ones as chips. */
export function AnalyticsFilters({
  query,
  onChange
}: {
  query: AnalyticsRangeQuery;
  onChange: (patch: Partial<AnalyticsRangeQuery>) => void;
}) {
  const chips = [
    query.role && { key: "role", label: labelOf(ROLE_OPTIONS, query.role), onRemove: () => onChange({ role: undefined }) },
    query.classType && query.classType !== "all" && {
      key: "classType",
      label: labelOf(CLASS_TYPE_OPTIONS, query.classType),
      onRemove: () => onChange({ classType: "all" })
    },
    query.acquisitionSource && {
      key: "source",
      label: labelOf(ACQUISITION_OPTIONS, query.acquisitionSource),
      onRemove: () => onChange({ acquisitionSource: undefined })
    },
  ].filter((chip): chip is ActiveFilter => Boolean(chip));

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <FilterChips filters={chips} />
      <FilterPopover
        activeCount={chips.length}
        emptyValue={EMPTY}
        onApply={(next) => onChange(next)}
        value={{ acquisitionSource: query.acquisitionSource, classType: query.classType ?? "all", role: query.role }}
      >
        {(draft, update) => (
          <>
            <FilterField htmlFor="analytics-filter-role" label="Role">
              <Select
                id="analytics-filter-role"
                onChange={(e) => update({ role: e.target.value || undefined })}
                options={ROLE_OPTIONS}
                value={draft.role ?? ""}
              />
            </FilterField>
            <FilterField htmlFor="analytics-filter-class" label="Classes">
              <Select
                id="analytics-filter-class"
                onChange={(e) =>
                  update({ classType: (e.target.value || "all") as AnalyticsRangeQuery["classType"] })
                }
                options={CLASS_TYPE_OPTIONS}
                value={draft.classType ?? "all"}
              />
            </FilterField>
            <FilterField htmlFor="analytics-filter-source" label="Acquisition source">
              <Select
                id="analytics-filter-source"
                onChange={(e) => update({ acquisitionSource: e.target.value || undefined })}
                options={ACQUISITION_OPTIONS}
                value={draft.acquisitionSource ?? ""}
              />
            </FilterField>
          </>
        )}
      </FilterPopover>
    </div>
  );
}
