"use client";

import { FormattedText } from "@/components/ui/FormattedText";
import { SectionCard } from "@/components/ui/SectionCard";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface Announcement {
  id: string;
  title: string;
  createdAt: string;
  description: string;
  type: string;
}

interface AnnouncementsProps {
  announcements: Announcement[];
}

export function Announcements({ announcements }: AnnouncementsProps) {
  const timeZone = useUserTimeZone();

  return (
    <SectionCard title="Announcements">
      <ul className="divide-y divide-app-border">
        {announcements.map((announcement) => (
          <li className="py-3 first:pt-0 last:pb-0" key={announcement.id}>
            <p className="text-sm font-semibold text-app-text">
              {announcement.title}
            </p>
            <p className="mt-0.5 text-xs text-app-muted">
              {formatFullDate(announcement.createdAt, timeZone)}
            </p>
            <FormattedText className="mt-1 text-sm text-app-muted" source={announcement.description} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
