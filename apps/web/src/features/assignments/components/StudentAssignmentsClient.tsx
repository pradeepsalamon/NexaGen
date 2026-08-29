"use client";

import Link from "next/link";
import type { StudentAssignmentItem } from "@nexa-chess/types";
import { ArrowRight, Target } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyAssignments } from "../hooks/useAssignmentsApi";
import { DifficultyBadge, DueBadge, StatusBadge } from "./assignmentBadges";

export function StudentAssignmentsClient() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useMyAssignments();

  const assignments = data?.assignments ?? [];
  const pending = assignments.filter((a) => a.status !== "COMPLETED");
  const done = assignments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <PageHeader
        title="Assignments & Practice"
        description="Work assigned by your coach. Replay each line, then mark it complete."
      />

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <Card className="p-6 sm:p-12">
          <EmptyState
            icon={Target}
            title="No assignments yet"
            description="When your coach assigns practice, it will show up here."
          />
        </Card>
      ) : (
        <>
          <Section title={`To do (${pending.length})`} items={pending} timeZone={timeZone} empty="You're all caught up." />
          {done.length > 0 && (
            <Section title={`Completed (${done.length})`} items={done} timeZone={timeZone} empty="" />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  timeZone,
  empty
}: {
  title: string;
  items: StudentAssignmentItem[];
  timeZone: string;
  empty: string;
}) {
  return (
    <Card className="border-app-border bg-app-surface">
      <CardHeader className="border-b border-app-border/50 pb-3">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-app-muted">{empty}</p>
        ) : (
          <div className="divide-y divide-app-border/50">
            {items.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 p-5 transition-colors hover:bg-app-background/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-2">
                  <h4 className="font-semibold text-app-text">{a.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <DifficultyBadge difficulty={a.difficulty} />
                    <DueBadge dueDate={a.dueDate} formatted={formatFullDate(a.dueDate, timeZone)} />
                    <StatusBadge status={a.status} />
                    {a.coachName && <span className="text-app-muted">by {a.coachName}</span>}
                  </div>
                </div>
                <Link href={`/student/practice/${a.id}`} className="w-full sm:w-auto">
                  <Button
                    variant={a.status === "COMPLETED" ? "outline" : "primary"}
                    size="sm"
                    className="w-full font-bold"
                  >
                    {a.status === "PENDING" ? "Start" : a.status === "IN_PROGRESS" ? "Resume" : "Review"}
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
