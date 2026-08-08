import { Badge } from "@/components/ui/Badge";
import type { BatchStatus } from "@nexa-chess/types";

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge variant={getStatusBadgeVariant(status)} className="text-[10px] uppercase font-bold tracking-wider">
      {status}
    </Badge>
  );
}

function getStatusBadgeVariant(status: BatchStatus) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "UPCOMING":
      return "warning";
    case "COMPLETED":
      return "secondary";
    case "ARCHIVED":
    default:
      return "default";
  }
}
