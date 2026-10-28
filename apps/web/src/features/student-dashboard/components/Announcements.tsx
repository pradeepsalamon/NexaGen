"use client";

import { Megaphone } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <div
      className={`h-full rounded-2xl border p-4 sm:p-6 transition-colors duration-200 ${isDark
          ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
        }`}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={`flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border ${isDark
              ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
              : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
            }`}
        >
          <Megaphone aria-hidden="true" className="size-4" strokeWidth={2.1} />
        </span>
        <h2 className="text-sm sm:text-base font-bold">Announcements</h2>
      </div>

      <ul
        className={`-my-2 divide-y ${isDark ? "divide-white/8" : "divide-[#EEF2F7]"
          }`}
      >
        {announcements.map((announcement) => (
          <li className="py-3" key={announcement.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-bold">
                {announcement.title}
              </p>
              <span
                className={`shrink-0 text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                  }`}
              >
                {formatFullDate(announcement.createdAt, timeZone)}
              </span>
            </div>
            <p
              className={`mt-1 line-clamp-2 text-xs sm:text-sm ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              {announcement.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}