"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Megaphone, Bell } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface Announcement {
  id: string;
  title: string;
  createdAt: string;
  description: string;
  type: "BATCH" | "COURSE" | "PLATFORM";
}

interface AnnouncementsProps {
  announcements?: Announcement[];
}

export function Announcements({ announcements = [] }: AnnouncementsProps) {
  const timeZone = useUserTimeZone();

  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full flex flex-col">
      <CardHeader className="pb-4 border-b border-app-border/50">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-accent" />
          Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto">
        {announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <Bell className="h-10 w-10 text-app-border mb-3" />
            <p className="text-app-text font-medium">No announcements yet.</p>
            <p className="text-sm text-app-muted mt-1">We&apos;ll notify you when there&apos;s an update.</p>
          </div>
        ) : (
          <div className="divide-y divide-app-border/50">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="p-5 hover:bg-app-background/50 transition-colors">
                <div className="flex justify-between items-start mb-2 gap-4">
                  <h4 className="font-semibold text-app-text text-sm md:text-base leading-tight">
                    {announcement.title}
                  </h4>
                  <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                    {announcement.type}
                  </Badge>
                </div>
                <p className="text-sm text-app-muted line-clamp-2">
                  {announcement.description}
                </p>
                <p className="text-xs text-app-muted font-medium mt-3">
                  {formatFullDate(announcement.createdAt, timeZone)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
