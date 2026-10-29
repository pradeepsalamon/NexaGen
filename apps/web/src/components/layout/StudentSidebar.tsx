"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import {
  filterNavByPlan,
  studentNavItems,
  type NavBadge,
  type NavItem
} from "@/components/layout/navItems";
import { useMyAssignmentReminders } from "@/features/assignments/hooks/useAssignmentsApi";
import { useChatNavBadge } from "@/features/chat/hooks/useChat";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";

function useStudentNavBadges(): Record<string, NavBadge | undefined> {
  const { data } = useStudentDashboard();
  const { data: reminders } = useMyAssignmentReminders();
  const timeZone = useUserTimeZone();

  if (!data) {
    return {};
  }

  const todaysClass = data.todaysClass;
  const upcoming: { startsAt: string }[] = data.upcomingClasses ?? [];
  const isLive = !!data.liveClass;

  const todayCount =
    (todaysClass &&
      formatRelativeDay(todaysClass.startsAt, timeZone) === "Today"
      ? 1
      : 0) +
    upcoming.filter(
      (cls) => formatRelativeDay(cls.startsAt, timeZone) === "Today"
    ).length;

  const courseCount: number = data.courses?.length ?? 0;
  const pendingWork: number = data.practices?.length ?? 0;
  const dueCounts = reminders?.counts;
  const dueCount = dueCounts
    ? dueCounts.overdue + dueCounts.dueToday + dueCounts.dueSoon
    : 0;
  const attendance = data.progressMetrics?.find(
    (metric: { label: string }) => metric.label === "Attendance"
  )?.value;

  return {
    "/student/courses": courseCount
      ? { label: String(courseCount), tone: "primary" }
      : undefined,
    "/student/batches": data.batchName
      ? { pulse: true, tone: "accent", variant: "dot" }
      : undefined,
    "/student/live-classes": isLive
      ? { label: "Live", pulse: true, tone: "danger" }
      : undefined,
    "/student/schedule": todayCount
      ? { label: `${todayCount} Today`, tone: "secondary" }
      : undefined,
    "/student/practice": dueCount
      ? {
        label: String(dueCount),
        tone: dueCounts?.overdue ? "danger" : "secondary"
      }
      : pendingWork
        ? { tone: "secondary", variant: "dot" }
        : undefined,
    "/student/attendance": attendance
      ? { label: attendance, tone: "accent" }
      : undefined
  };
}

export function StudentSidebar() {
  const pathname = usePathname();
  const badges = useStudentNavBadges();
  const chatBadge = useChatNavBadge();
  const planFeatures = useCurrentEntitlements().data?.features;

  const items: NavItem[] = filterNavByPlan(studentNavItems, planFeatures).map(
    (item) => ({
      ...item,
      badge: item.href === "/messages" ? chatBadge : badges[item.href]
    })
  );

  return (
    <NavDrawer subtitle="Student" title="Nexa Chess">
      {items.map((item) => (
        <NavDrawerLink
          active={pathname === item.href}
          item={item}
          key={item.href}
        />
      ))}
    </NavDrawer>
  );
}