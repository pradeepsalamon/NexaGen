import { Card, CardContent } from "@/components/ui/Card";
import { CheckCircle2, Clock, Users, BookOpen } from "lucide-react";

interface ProgressMetric {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
}

interface ProgressOverviewProps {
  metrics?: ProgressMetric[];
}

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
  const defaultMetrics: ProgressMetric[] = [
    { label: "Classes Attended", value: "24", icon: <Users className="h-5 w-5 text-primary" /> },
    { label: "Attendance", value: "92%", icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, trend: "+2% this month" },
    { label: "Lessons Completed", value: "18", icon: <BookOpen className="h-5 w-5 text-accent" /> },
    { label: "Practice Hours", value: "32h", icon: <Clock className="h-5 w-5 text-secondary" />, trend: "+4h this week" },
  ];

  const displayMetrics = metrics || defaultMetrics;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {displayMetrics.map((metric, index) => (
        <Card key={index} className="border-app-border bg-app-surface shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-app-background border border-app-border">
                {metric.icon}
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-app-text">{metric.value}</p>
            <p className="text-sm font-medium text-app-muted mt-1">{metric.label}</p>
            {metric.trend && (
              <p className="text-xs text-green-600 font-medium mt-2">
                {metric.trend}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
