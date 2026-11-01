import type { ApprovalStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

const LABEL: Record<ApprovalStatus, string> = {
  APPROVED: "Approved",
  CANCELLED: "Withdrawn",
  EXPIRED: "Expired",
  PENDING: "Waiting",
  REJECTED: "Rejected"
};

const VARIANT: Record<ApprovalStatus, "warning" | "success" | "destructive" | "secondary"> = {
  APPROVED: "success",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
  PENDING: "warning",
  REJECTED: "destructive"
};

export const APPROVAL_STATUS_OPTIONS: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
export const APPROVAL_STATUS_LABELS = LABEL;

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
