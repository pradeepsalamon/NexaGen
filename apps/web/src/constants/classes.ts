import type { VariantProps } from "class-variance-authority";
import type { ClassDisplayStatus } from "@nexa-chess/types";
import type { badgeVariants } from "@/components/ui/Badge";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export const getClassStatusBadgeVariant = (status: string): BadgeVariant => {
  switch (status) {
    case "SCHEDULED": return "warning";
    case "IN_PROGRESS":
    case "LIVE": return "success";
    case "COMPLETED": return "secondary";
    case "CANCELLED": return "destructive";
    case "NOT_HELD": return "outline";
    default: return "default";
  }
};

export const getStatusLabel = (status: string) => {
  if (status === "NOT_HELD") return "Not held";
  return status.replace("_", " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Calendar dot per displayed status (`resolveClassDisplayStatus`). One map for
 * every calendar so a colour means the same thing everywhere, and the legend
 * (`ClassStatusLegend`) is drawn from it.
 */
export const CLASS_STATUS_DOT: Record<ClassDisplayStatus, string> = {
  SCHEDULED: "bg-primary",
  LIVE: "bg-success",
  COMPLETED: "bg-app-muted",
  NOT_HELD: "bg-warning",
  CANCELLED: "bg-app-danger"
};

export const CLASS_STATUS_LEGEND: { status: ClassDisplayStatus; label: string }[] = [
  { status: "SCHEDULED", label: "Scheduled" },
  { status: "LIVE", label: "Live" },
  { status: "COMPLETED", label: "Completed" },
  { status: "NOT_HELD", label: "Not held" },
  { status: "CANCELLED", label: "Cancelled" }
];
