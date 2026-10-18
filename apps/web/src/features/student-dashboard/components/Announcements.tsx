"use client";

import { SectionCard } from "@/components/ui/SectionCard";
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
  announcements: Announcement[];
}

export function Announcements({ announcements }: AnnouncementsProps) {
  const timeZone = useUserTimeZone();

  return (
    <SectionCard className="h-full" title="Announcements">
      <ul className="-my-2 divide-y divide-app-border">
        {announcements.map((announcement) => (
          <li className="py-3" key={announcement.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-bold text-app-text">
                {announcement.title}
              </p>
              <span className="shrink-0 text-xs text-app-muted">
                {formatFullDate(announcement.createdAt, timeZone)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-app-muted">
              {announcement.description}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
