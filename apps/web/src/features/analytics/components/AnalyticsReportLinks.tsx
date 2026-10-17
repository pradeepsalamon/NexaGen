"use client";

import { ChevronRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SectionCard } from "@/components/ui/SectionCard";
import { adminNavItems, type NavItem } from "@/components/layout/navItems";
import { pageTitle, type PageRoute } from "@/lib/pageTitles";

const DESCRIPTIONS: Record<string, string> = {
  "/admin/analytics/acquisition": "How people discover Nexa Chess.",
  "/admin/analytics/attendance": "Attendance trend and the batches, coaches and students that need attention.",
  "/admin/analytics/batches": "Roster sizes, class delivery, attendance and teaching hours per batch.",
  "/admin/analytics/classes": "Live-class delivery: demo vs batch, status and volume over time.",
  "/admin/analytics/coaches": "Coach activity, teaching hours and the performance leaderboard.",
  "/admin/analytics/engagement": "Who is actually active: logins, class joins, attempts and recordings watched.",
  "/admin/analytics/recordings": "Recording volume and duration, disk usage and a capacity forecast.",
  "/admin/analytics/students": "Student roster, engagement and who needs a nudge.",
  "/admin/analytics/users": "Registrations over time and the shape of the user base."
};

const STUDENTS: NavItem = {
  group: "Analytics",
  href: "/admin/analytics/students",
  icon: GraduationCap,
  label: pageTitle("/admin/analytics/students")
};

const REPORTS = [
  ...adminNavItems.filter((item) => item.group === "Analytics" && item.href in DESCRIPTIONS),
  STUDENTS
];

/** The dashboard's way into each full report, keeping the selected range and filters. */
export function AnalyticsReportLinks() {
  const params = useSearchParams().toString();

  return (
    <SectionCard
      description="Each report covers the range and filters selected above."
      title="Reports"
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(({ href, icon: Icon }) => (
          <li key={href}>
            <Link
              className="group flex h-full items-start gap-3 rounded-control border border-app-border bg-app-surface p-4 font-normal text-app-text transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:opacity-100"
              href={params ? `${href}?${params}` : href}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-control border border-primary/25 bg-primary/10 text-primary-ink"
              >
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{pageTitle(href as PageRoute)}</span>
                <span className="mt-0.5 block text-sm text-app-muted">{DESCRIPTIONS[href]}</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-2 size-4 shrink-0 text-app-muted transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
