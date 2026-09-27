"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { RatingCard } from "@/components/layout/RatingCard";
import { studentNavItems, type NavBadge, type NavItem } from "@/components/layout/navItems";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";
import { useAuthStore } from "@/stores/authStore";

/**
 * Every badge below is derived from the dashboard payload — the same query the
 * page uses, so this shares its cache rather than issuing a second request.
 * Anything the API cannot answer (streaks, puzzle counts, rating deltas) simply
 * has no badge instead of a placeholder.
 */
function useStudentNavBadges(): Record<string, NavBadge | undefined> {
  const { data } = useStudentDashboard();
  const timeZone = useUserTimeZone();

  if (!data) {
    return {};
  }

  const todaysClass = data.todaysClass;
  const upcoming: { startsAt: string }[] = data.upcomingClasses ?? [];
  const isLive = !!data.liveClass;

  // The featured class may be a later day's when nothing is on today.
  const todayCount =
    (todaysClass && formatRelativeDay(todaysClass.startsAt, timeZone) === "Today" ? 1 : 0) +
    upcoming.filter((cls) => formatRelativeDay(cls.startsAt, timeZone) === "Today")
      .length;

  const courseCount: number = data.courses?.length ?? 0;
  const pendingWork: number = data.practices?.length ?? 0;
  const attendance = data.progressMetrics?.find(
    (metric: { label: string }) => metric.label === "Attendance"
  )?.value;

  return {
    "/student/courses": courseCount
      ? { label: String(courseCount), tone: "primary" }
      : undefined,
    // A dot, not the name: real batch names ("Advanced Calculation") are far
    // longer than the mock's "Batch A" and truncate the link's own label away.
    // The full name is on the dashboard's welcome pill.
    "/student/batches": data.batchName
      ? { pulse: true, tone: "accent", variant: "dot" }
      : undefined,
    "/student/live-classes": isLive
      ? { label: "Live", pulse: true, tone: "danger" }
      : undefined,
    "/student/schedule": todayCount
      ? { label: `${todayCount} Today`, tone: "secondary" }
      : undefined,
    "/student/practice": pendingWork
      ? { tone: "secondary", variant: "dot" }
      : undefined,
    "/student/attendance": attendance
      ? { label: attendance, tone: "accent" }
      : undefined
  };
}

function ProfileCard() {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Student";
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "S";

  return (
    <Link
      className="flex items-center gap-3 rounded-app border border-app-border bg-app-soft p-2 transition-colors hover:border-primary"
      href="/profile"
    >
      <span className="relative shrink-0">
        <span className="flex size-9 items-center justify-center rounded-control bg-primary text-sm font-bold text-white">
          {initials}
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-app-surface bg-accent"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-app-text">{name}</span>
        <span className="block truncate text-[11px] text-app-muted">{user.email}</span>
      </span>
    </Link>
  );
}

export function StudentSidebar() {
  const pathname = usePathname();
  const badges = useStudentNavBadges();
  const { data } = useStudentDashboard();

  const items: NavItem[] = studentNavItems.map((item) => ({
    ...item,
    badge: badges[item.href]
  }));

  return (
    <NavDrawer
      footer={
        <>
          <RatingCard rating={data?.chessRating} />
          <ProfileCard />
        </>
      }
      subtitle="Student"
      title="Nexa Chess"
    >
      {items.map((item) => (
        <NavDrawerLink active={pathname === item.href} item={item} key={item.href} />
      ))}
    </NavDrawer>
  );
}
