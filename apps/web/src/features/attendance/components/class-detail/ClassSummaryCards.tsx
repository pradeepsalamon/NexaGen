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
      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Clock className="h-5 w-5 text-primary" />
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

      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Clock className="h-5 w-5 text-blue-500" />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-blue-600">
            {formatDuration(data.actualDuration)}
          </p>
          <p className="text-sm font-medium text-app-muted mt-1">
            Actual Duration
          </p>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Users className="h-5 w-5 text-purple-500" />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-purple-600">
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

      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <Users className="h-5 w-5 text-green-500" />
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
