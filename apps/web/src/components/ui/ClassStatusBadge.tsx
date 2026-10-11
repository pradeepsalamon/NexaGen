import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { getClassStatusBadgeVariant, getStatusLabel } from "@/constants/classes";
import { resolveClassDisplayStatus, type ClassStatus } from "@nexa-chess/types";

interface ClassStatusBadgeProps {
  status: string | ClassStatus;
  /**
   * The class's scheduled end. With it, a SCHEDULED class whose window passed
   * without starting reads "Not held" instead of still looking upcoming.
   */
  endsAt?: string;
  className?: string;
}

export function ClassStatusBadge({ status, endsAt, className }: ClassStatusBadgeProps) {
  if (!status) return null;

  const shown = endsAt
    ? resolveClassDisplayStatus({ status, startsAt: endsAt, endsAt })
    : status;
  const isLive = shown === "LIVE" || shown === "IN_PROGRESS";

  return (
    <Badge
      variant={getClassStatusBadgeVariant(shown)}
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
      {isLive ? "Live now" : getStatusLabel(shown)}
    </Badge>
  );
}
