import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Clock, User, Calendar, Play } from "lucide-react";
import Link from "next/link";
// removed LiveClassStatus import

interface TodaysClassProps {
  id?: string;
  topic?: string;
  coachName?: string;
  time?: string;
  duration?: string;
  status?: string;
}

export function TodaysClass({
  id,
  topic,
  coachName,
  time,
  duration,
  status
}: TodaysClassProps) {
  if (!topic) {
    return (
      <Card className="h-full border-app-border bg-app-surface shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Today&apos;s Class</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center py-8">
          <div className="bg-app-soft p-4 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-app-muted" />
          </div>
          <p className="text-app-text font-medium">No class scheduled for today</p>
          <p className="text-sm text-app-muted mt-1">Enjoy your free time or continue practicing!</p>
        </CardContent>
      </Card>
    );
  }

  const isLive = status === "IN_PROGRESS" || status === "LIVE";
  const isEnded = status === "ENDED" || status === "COMPLETED";

  return (
    <Card className={`h-full border-app-border shadow-sm transition-all ${isLive ? 'border-primary/50 ring-1 ring-primary/20 bg-primary/5' : 'bg-app-surface'}`}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Today&apos;s Class</CardTitle>
        {isLive && (
          <Badge variant="destructive" className="animate-pulse bg-red-500 hover:bg-red-600 shadow-sm">
            LIVE NOW
          </Badge>
        )}
        {status === "SCHEDULED" && <Badge variant="secondary">Upcoming</Badge>}
        {isEnded && <Badge variant="outline">Completed</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-bold text-xl leading-tight text-app-text">{topic}</h3>
          <div className="flex items-center text-app-muted mt-2 text-sm gap-4">
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              <span>{coachName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{time} ({duration})</span>
            </div>
          </div>
        </div>

        {isLive && id && (
          <Link href={`/live-class/${id}`} className="block mt-4">
            <Button className="w-full bg-primary text-white font-bold hover:opacity-90 shadow-sm">
              <Play className="h-4 w-4 mr-2" />
              Join Live Class
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
