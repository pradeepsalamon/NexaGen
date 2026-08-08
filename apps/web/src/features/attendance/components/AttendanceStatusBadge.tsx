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
        <Badge variant="default" className={`bg-green-100 text-green-800 border-green-200 gap-1.5 font-medium ${className || ""}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Present
        </Badge>
      );
    case "LATE":
      return (
        <Badge variant="default" className={`bg-yellow-100 text-yellow-800 border-yellow-200 gap-1.5 font-medium ${className || ""}`}>
          <Clock className="w-3.5 h-3.5" />
          Late
        </Badge>
      );
    case "PARTIAL":
      return (
        <Badge variant="default" className={`bg-orange-100 text-orange-800 border-orange-200 gap-1.5 font-medium ${className || ""}`}>
          <HelpCircle className="w-3.5 h-3.5" />
          Partial
        </Badge>
      );
    case "ABSENT":
      return (
        <Badge variant="destructive" className={`bg-red-100 text-red-800 border-red-200 gap-1.5 font-medium ${className || ""}`}>
          <XCircle className="w-3.5 h-3.5" />
          Absent
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className={`gap-1.5 font-medium ${className || ""}`}>
          Unknown
        </Badge>
      );
  }
}
