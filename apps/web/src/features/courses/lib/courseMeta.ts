import type { CourseStatus } from "@nexa-chess/types";

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived"
};

export const COURSE_STATUS_OPTIONS = (Object.keys(COURSE_STATUS_LABELS) as CourseStatus[]).map(
  (value) => ({ value, label: COURSE_STATUS_LABELS[value] })
);

export function courseStatusBadgeVariant(
  status: CourseStatus
): "success" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "success";
  if (status === "ARCHIVED") return "outline";
  return "secondary";
}
