import { BookOpen, CheckCircle2, Users, type LucideIcon } from "lucide-react";
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

const METRIC_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  "Classes Attended": { icon: Users, tone: "primary" },
  Attendance: { icon: CheckCircle2, tone: "accent" },
  "Lessons Completed": { icon: BookOpen, tone: "warm" }
};

const DEFAULT_METRICS: ProgressMetric[] = [
  { label: "Classes Attended", value: "0" },
  { label: "Lessons Completed", value: "0" },
  { label: "Attendance", value: "0%" }
];

function percentOf(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
  const displayMetrics = (metrics?.length ? metrics : DEFAULT_METRICS).filter(
    (metric) => metric.label in METRIC_STYLE
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {displayMetrics.map((metric) => {
        const style = METRIC_STYLE[metric.label];

        return (
          <StatTile
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
