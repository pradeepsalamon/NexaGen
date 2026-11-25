import { CLASS_RECAP_STATUS_LABELS, type ClassRecapStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

const VARIANT: Record<ClassRecapStatus, "secondary" | "info" | "warning" | "success" | "outline" | "destructive"> = {
  DISCARDED: "outline",
  FAILED: "destructive",
  PUBLISHED: "success",
  QUEUED: "secondary",
  READY: "warning",
  RUNNING: "info",
  SKIPPED: "outline"
};

export function ClassRecapStatusBadge({ status }: { status: ClassRecapStatus }) {
  return <Badge variant={VARIANT[status]}>{CLASS_RECAP_STATUS_LABELS[status]}</Badge>;
}
