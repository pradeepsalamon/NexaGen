"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
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

export function AnalyticsFilters({
  query,
  onChange
}: {
  query: AnalyticsRangeQuery;
  onChange: (patch: Partial<AnalyticsRangeQuery>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        aria-label="Role filter"
        className="w-auto min-w-[8rem]"
        onChange={(e) => onChange({ role: e.target.value || undefined })}
        options={ROLE_OPTIONS}
        value={query.role ?? ""}
      />
      <Select
        aria-label="Class type filter"
        className="w-auto min-w-[8rem]"
        onChange={(e) =>
          onChange({
            classType: (e.target.value ||
              "all") as AnalyticsRangeQuery["classType"]
          })
        }
        options={CLASS_TYPE_OPTIONS}
        value={query.classType ?? "all"}
      />
      <Select
        aria-label="Acquisition source filter"
        className="w-auto min-w-[8rem]"
        onChange={(e) =>
          onChange({ acquisitionSource: e.target.value || undefined })
        }
        options={ACQUISITION_OPTIONS}
        value={query.acquisitionSource ?? ""}
      />
    </div>
  );
}
