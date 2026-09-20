import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from "@nexa-chess/types";
import type { SelectOption } from "@/components/ui/Select";

export const LEAD_STATUS_OPTIONS: SelectOption[] = LEAD_STATUSES.map((status) => ({
  label: LEAD_STATUS_LABELS[status],
  value: status
}));

const LEAD_STATUS_BADGE_VARIANT: Record<
  LeadStatus,
  "default" | "secondary" | "success" | "warning" | "info" | "destructive"
> = {
  NEW: "default",
  CONTACTED: "info",
  INTERESTED: "info",
  DEMO_SCHEDULED: "warning",
  DEMO_ATTENDED: "warning",
  FOLLOW_UP: "warning",
  PAYMENT_PENDING: "warning",
  CONVERTED: "success",
  ACTIVE_STUDENT: "success",
  LOST: "destructive"
};

export function leadStatusBadgeVariant(status: LeadStatus) {
  return LEAD_STATUS_BADGE_VARIANT[status];
}
