"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { ClassStatus } from "@/features/live-class/types/live-class";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayOfMonth, formatMonthShort, formatTime } from "@/lib/datetime";

interface ScheduledClass {
  id: string;
  startsAt: string;
  coach: string;
  topic: string;
  status: ClassStatus;
}

interface UpcomingClassesProps {
  classes?: ScheduledClass[];
}

export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  const timeZone = useUserTimeZone();
  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full flex flex-col">
      <CardHeader className="pb-4 flex flex-row items-center justify-between border-b border-app-border/50">
        <CardTitle className="text-lg font-semibold">Upcoming Classes</CardTitle>
        <Link href="/student/schedule">
          <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10">
            View Schedule
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto">
        {classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <Calendar className="h-10 w-10 text-app-border mb-3" />
            <p className="text-app-text font-medium">No upcoming classes scheduled.</p>
            <p className="text-sm text-app-muted mt-1">Check back later or view your full schedule.</p>
          </div>
        ) : (
          <div className="divide-y divide-app-border/50">
            {classes.map((cls) => (
              <div key={cls.id} className="p-4 md:p-5 hover:bg-app-background/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex flex-col items-center justify-center bg-app-background border border-app-border rounded-lg p-2 min-w-[70px]">
                    <span className="text-xs font-bold text-primary uppercase">{formatMonthShort(cls.startsAt, timeZone)}</span>
                    <span className="text-lg font-bold text-app-text">{formatDayOfMonth(cls.startsAt, timeZone)}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-app-text">{cls.topic}</h4>
                    <div className="flex items-center gap-3 text-sm text-app-muted mt-1">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(cls.startsAt, timeZone)}
                      </span>
                      <span className="hidden sm:inline">•</span>
                      <span>Coach {cls.coach}</span>
                    </div>
                  </div>
                </div>
                <ClassStatusBadge status={cls.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

