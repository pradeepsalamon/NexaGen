import { BookOpen, CheckCircle2, Clock, Users, type LucideIcon } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import type { Tone } from "@/lib/tone";

interface ProgressMetric {
  label: string;
  value: string;
  trend?: string;
}

interface ProgressOverviewProps {
  metrics?: ProgressMetric[];
}

const METRIC_STYLE: Record<
  string,
  { context?: string; icon: LucideIcon; tone: Tone }
> = {
  "Classes Attended": { context: "Total", icon: Users, tone: "primary" },
  Attendance: { context: "Record", icon: CheckCircle2, tone: "accent" },
  "Lessons Completed": { context: "This Month", icon: BookOpen, tone: "warm" },
  "Practice Hrs": { context: "Total", icon: Clock, tone: "secondary" }
};

const DEFAULT_METRICS: ProgressMetric[] = [
  { label: "Classes Attended", value: "0" },
  { label: "Attendance", value: "0%" },
  { label: "Lessons Completed", value: "0" },
  { label: "Practice Hrs", value: "0" }
];

/** A "72%" style value becomes a ring; anything else stays a flat chip. */
function percentOf(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());

  return match ? Number(match[1]) : undefined;
}

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
  const displayMetrics = metrics?.length ? metrics : DEFAULT_METRICS;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {displayMetrics.map((metric) => {
        const style = METRIC_STYLE[metric.label] ?? {
          icon: CheckCircle2,
          tone: "primary" as Tone
        };

        return (
          <StatTile
            context={style.context}
            icon={style.icon}
            key={metric.label}
            label={metric.label}
            progress={percentOf(metric.value)}
            tone={style.tone}
            trend={metric.trend || undefined}
            value={metric.value}
          />
        );
      })}
    </div>
  );
}
