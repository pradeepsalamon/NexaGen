import { BookOpen, GraduationCap, Target, Trophy } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { cn } from "@/lib/utils";

interface ProgressMetric {
  label: string;
  value: string;
  trend?: string;
}

interface ProgressOverviewProps {
  chessRating?: number | null;
  metrics?: ProgressMetric[];
}

function metricValue(metrics: ProgressMetric[] | undefined, label: string, fallback: string) {
  return metrics?.find((metric) => metric.label === label)?.value ?? fallback;
}

export function ProgressOverview({ chessRating, metrics }: ProgressOverviewProps) {
  const attendance = metricValue(metrics, "Attendance", "0%");
  // A non-numeric value ("—") draws no bar rather than an invalid width.
  const attendancePercent = Number.parseFloat(attendance);
  const hasRating = typeof chessRating === "number";

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        hasRating ? "lg:grid-cols-4" : "sm:grid-cols-3"
      )}
    >
      {hasRating ? (
        <StatTile
          icon={Trophy}
          label="Chess rating"
          tone="reward"
          value={String(chessRating)}
        />
      ) : null}
      <StatTile
        icon={GraduationCap}
        label="Classes attended"
        tone="primary"
        value={metricValue(metrics, "Classes Attended", "0")}
      />
      <StatTile
        icon={BookOpen}
        label="Lessons completed"
        tone="primary"
        value={metricValue(metrics, "Lessons Completed", "0")}
      />
      <div className={cn(!hasRating && "col-span-2 sm:col-span-1")}>
        <StatTile
          icon={Target}
          label="Attendance"
          progress={Number.isFinite(attendancePercent) ? attendancePercent : undefined}
          tone="accent"
          value={attendance}
        />
      </div>
    </div>
  );
}
