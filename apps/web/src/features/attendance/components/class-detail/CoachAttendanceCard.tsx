import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ClassDetailCoachAttendance } from "@nexa-chess/types";
import { formatDuration, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { EventTimeline } from "./EventTimeline";

export const CoachAttendanceCard = memo(function CoachAttendanceCard({
  coach,
}: {
  coach: ClassDetailCoachAttendance;
}) {
  const tz = useUserTimeZone();
  return (
    <Card className="border-app-border bg-app-surface shadow-card">
      <CardHeader className="bg-app-soft/50 border-b border-app-border">
        <CardTitle className="text-lg">
          Coach Attendance — {coach.coachName}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium text-app-muted uppercase">Joined</p>
            <p className="text-sm font-medium text-app-text">
              {formatTime(coach.joinedAt, tz) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase">Left</p>
            <p className="text-sm font-medium text-app-text">
              {formatTime(coach.leftAt, tz) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase">
              Total Duration
            </p>
            <p className="text-sm font-medium text-app-text">
              {coach.totalDuration ? formatDuration(coach.totalDuration) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase">
              Reconnects
            </p>
            <p className="text-sm font-medium text-app-text">
              {coach.reconnectCount}
            </p>
          </div>
        </div>

        {coach.logs.length > 0 && (
          <div className="border-t border-app-border pt-4">
            <h4 className="text-sm font-semibold text-app-text mb-3">
              Event Timeline
            </h4>
            <EventTimeline logs={coach.logs} className="space-y-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
});
