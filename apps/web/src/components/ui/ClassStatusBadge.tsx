import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { getClassStatusBadgeVariant, getStatusLabel } from "@/constants/classes";
import { ClassStatus } from "@nexa-chess/types";

interface ClassStatusBadgeProps {
  status: string | ClassStatus;
  className?: string;
}

export function ClassStatusBadge({ status, className }: ClassStatusBadgeProps) {
  if (!status) return null;

  const isLive = status === "LIVE" || status === "IN_PROGRESS";

  return (
    <Badge
      variant={getClassStatusBadgeVariant(status)}
      className={cn(
        "uppercase text-[10px] tracking-wider",
        isLive && "bg-app-danger text-white",
        className
      )}
    >
      {isLive ? (
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-white"
        />
      ) : null}
      {isLive ? "Live now" : getStatusLabel(status)}
    </Badge>
  );
}
