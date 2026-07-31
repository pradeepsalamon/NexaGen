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
    { label: "Classes Attended", value: "0", icon: <Users className="h-5 w-5 text-primary" /> },
    { label: "Attendance", value: "0%", icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
    { label: "Lessons Completed", value: "0", icon: <BookOpen className="h-5 w-5 text-accent" /> },
    { label: "Practice Hrs", value: "0", icon: <Clock className="h-5 w-5 text-secondary" /> },
  ];

  const getIconForLabel = (label: string) => {
    switch (label) {
      case "Classes Attended": return <Users className="h-5 w-5 text-primary" />;
      case "Attendance": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "Lessons Completed": return <BookOpen className="h-5 w-5 text-accent" />;
      case "Practice Hrs": return <Clock className="h-5 w-5 text-secondary" />;
      default: return <CheckCircle2 className="h-5 w-5 text-app-muted" />;
    }
  };

  const displayMetrics = metrics?.map(m => ({
    ...m,
    icon: m.icon || getIconForLabel(m.label)
  })) || defaultMetrics;

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
