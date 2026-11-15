import { memo } from "react";
import { Clock, Timer, UserCheck, Users } from "lucide-react";
import type { ClassDetailReport } from "@nexa-chess/types";
import { StatTile } from "@/components/ui/StatTile";
import { formatDuration } from "@/lib/datetime";

export const ClassSummaryCards = memo(function ClassSummaryCards({
  data,
}: {
  data: ClassDetailReport;
}) {
  const attended = data.presentCount + data.lateCount + data.partialCount;
  const percent = Math.round(data.overallPercent);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile icon={Clock} label="Scheduled duration" tone="primary" value={formatDuration(data.scheduledDuration)} />
      <StatTile icon={Timer} label="Actual duration" tone="primary" value={formatDuration(data.actualDuration)} />
      <StatTile
        context={`${data.absentCount} absent`}
        icon={Users}
        label="Students attended"
        tone="accent"
        value={`${attended} / ${data.totalStudents}`}
      />
      <StatTile icon={UserCheck} label="Overall attendance" progress={percent} tone="accent" value={`${percent}%`} />
    </div>
  );
});
