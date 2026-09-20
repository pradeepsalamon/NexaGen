import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, Clock, HelpCircle, XCircle } from "lucide-react";

export type AttendanceStatus = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT";

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus | string;
  className?: string;
}

export function AttendanceStatusBadge({ status, className }: AttendanceStatusBadgeProps) {
  switch (status) {
    case "PRESENT":
      return (
        <Badge variant="success" className={`gap-1.5 ${className || ""}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Present
        </Badge>
      );
    case "LATE":
      return (
        <Badge variant="warning" className={`gap-1.5 ${className || ""}`}>
          <Clock className="w-3.5 h-3.5" />
          Late
        </Badge>
      );
    case "PARTIAL":
      return (
        <Badge variant="warning" className={`gap-1.5 ${className || ""}`}>
          <HelpCircle className="w-3.5 h-3.5" />
          Partial
        </Badge>
      );
    case "ABSENT":
      return (
        <Badge variant="destructive" className={`gap-1.5 ${className || ""}`}>
          <XCircle className="w-3.5 h-3.5" />
          Absent
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className={`gap-1.5 ${className || ""}`}>
          Unknown
        </Badge>
      );
  }
}
