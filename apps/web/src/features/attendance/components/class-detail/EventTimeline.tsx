import { memo } from "react";
import { formatDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatEventLabel, getEventIcon } from "./classDetail.utils";

export interface TimelineLog {
  id: string;
  eventType: string;
  timestamp: string;
  reason: string | null;
}

export const EventTimeline = memo(function EventTimeline({
  logs,
  className,
}: {
  logs: TimelineLog[];
  className?: string;
}) {
  const tz = useUserTimeZone();

  if (logs.length === 0) return null;

  return (
    <div className={className}>
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 text-sm">
          {getEventIcon(log.eventType)}
          <span className="text-app-muted">
            {formatDate(log.timestamp, tz, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span className="font-medium text-app-text">
            {formatEventLabel(log.eventType)}
          </span>
          {log.reason && (
            <span className="text-app-muted italic">— {log.reason}</span>
          )}
        </div>
      ))}
    </div>
  );
});
