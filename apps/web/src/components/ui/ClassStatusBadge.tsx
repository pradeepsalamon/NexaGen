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
        "uppercase text-[10px] font-bold tracking-wider", 
        isLive && "animate-pulse bg-red-500 hover:bg-red-600 shadow-sm text-white border-transparent",
        className
      )}
    >
      {isLive ? "LIVE NOW" : getStatusLabel(status)}
    </Badge>
  );
}
