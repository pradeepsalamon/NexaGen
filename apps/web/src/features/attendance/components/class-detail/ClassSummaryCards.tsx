import { memo } from "react";
import { Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import type { ClassDetailReport } from "@nexa-chess/types";
import { AttendancePercentBar } from "../AttendancePercentBar";
import { formatDuration } from "@/lib/datetime";

export const ClassSummaryCards = memo(function ClassSummaryCards({
  data,
}: {
  data: ClassDetailReport;
}) {
  const attended = data.presentCount + data.lateCount + data.partialCount;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
              <Clock className="h-5 w-5 text-primary-ink" />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight">
            {formatDuration(data.scheduledDuration)}
          </p>
          <p className="text-sm font-medium text-app-muted mt-1">
            Scheduled Duration
          </p>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
              <Clock className="h-5 w-5 text-primary-ink" />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-primary-ink">
            {formatDuration(data.actualDuration)}
          </p>
          <p className="text-sm font-medium text-app-muted mt-1">
            Actual Duration
          </p>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
              <Users className="h-5 w-5 text-primary-ink" />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-primary-ink">
            {attended}{" "}
            <span className="text-lg text-app-muted font-medium">
              / {data.totalStudents}
            </span>
          </p>
          <p className="text-sm font-medium text-app-muted mt-1">
            Students Attended
          </p>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-control bg-success/10 border border-success/20">
              <Users className="h-5 w-5 text-success-ink" />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {Math.round(data.overallPercent)}%
            </p>
            <AttendancePercentBar percent={data.overallPercent} showText={false} />
          </div>
          <p className="text-sm font-medium text-app-muted mt-1">
            Overall Attendance
          </p>
        </CardContent>
      </Card>
    </div>
  );
});
