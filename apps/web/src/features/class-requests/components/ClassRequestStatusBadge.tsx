import { CLASS_REQUEST_STATUS_LABELS, type ClassRequestStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

const VARIANT: Record<ClassRequestStatus, "warning" | "success" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  WITHDRAWN: "secondary"
};

export function ClassRequestStatusBadge({ status }: { status: ClassRequestStatus }) {
  return <Badge variant={VARIANT[status]}>{CLASS_REQUEST_STATUS_LABELS[status]}</Badge>;
}
