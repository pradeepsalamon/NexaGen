import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/Badge";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export const getClassStatusBadgeVariant = (status: string): BadgeVariant => {
  switch (status) {
    case "SCHEDULED": return "warning";
    case "IN_PROGRESS": return "success";
    case "COMPLETED": return "secondary";
    case "CANCELLED": return "destructive";
    default: return "default";
  }
};

export const getStatusLabel = (status: string) => {
  return status.replace("_", " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};
