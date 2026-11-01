"use client";

import { Megaphone } from "lucide-react";
import { FormattedText } from "@/components/ui/FormattedText";
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
    <div
      className="h-full rounded-2xl border p-4 sm:p-6 transition-colors duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
        >
          <Megaphone aria-hidden="true" className="size-4" strokeWidth={2.1} />
        </span>
        <h2 className="text-sm sm:text-base font-bold">Announcements</h2>
      </div>

      <ul
        className="-my-2 divide-y divide-nx-line"
      >
        {announcements.map((announcement) => (
          <li className="py-3" key={announcement.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-bold">
                {announcement.title}
              </p>
              <span
                className="shrink-0 text-xs text-nx-muted"
              >
                {formatFullDate(announcement.createdAt, timeZone)}
              </span>
            </div>
            <FormattedText className="mt-1 text-xs sm:text-sm text-nx-muted" source={announcement.description} />
          </li>
        ))}
      </ul>
    </div>
  );
}