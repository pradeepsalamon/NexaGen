import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Activity, MessageSquare, CheckCircle, Video, PlayCircle } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "CLASS_JOINED" | "LESSON_COMPLETED" | "PRACTICE_FINISHED" | "FEEDBACK";
  title: string;
  time: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "CLASS_JOINED": return <Video className="h-4 w-4 text-primary" />;
      case "LESSON_COMPLETED": return <PlayCircle className="h-4 w-4 text-accent" />;
      case "PRACTICE_FINISHED": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "FEEDBACK": return <MessageSquare className="h-4 w-4 text-secondary" />;
      default: return <Activity className="h-4 w-4 text-app-muted" />;
    }
  };

  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full flex flex-col">
      <CardHeader className="pb-4 border-b border-app-border/50">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 flex-1 overflow-auto">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-6 text-center text-app-muted">
            <p>Your learning activity will appear here.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-app-border/50 ml-3 space-y-6">
            {activities.map((activity) => (
              <div key={activity.id} className="relative pl-6">
                <div className="absolute -left-[17px] bg-app-surface p-1 rounded-full border border-app-border">
                  {getIcon(activity.type)}
                </div>
                <div>
                  <p className="text-sm font-medium text-app-text">{activity.title}</p>
                  <p className="text-xs text-app-muted mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
