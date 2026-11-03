"use client";

import Link from "next/link";
import type {
  AssignmentActivityType,
  StudentAssignmentItem,
  StudentPuzzleSetProgress
} from "@nexa-chess/types";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CircleCheck,
  type LucideIcon,
  Microscope,
  Puzzle,
  Target
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useMyAssignments } from "../hooks/useAssignmentsApi";
import { ACTIVITY_LABEL, DIFFICULTY_LABEL, DueBadge, StatusBadge } from "./assignmentBadges";

const ACTIVITY_ICON: Record<AssignmentActivityType, LucideIcon> = {
  FREE_ANALYSIS: Microscope,
  PLAY_VS_ENGINE: Bot,
  PUZZLE_SET: Puzzle,
  REPLAY: BookOpen,
  SOLVE_LINE: Target
};

export function StudentAssignmentsClient() {
  const { data, error, isLoading, refetch } = useMyAssignments();

  const assignments = data?.assignments ?? [];
  // The API sends them soonest due first; finished work reads newest first.
  const pending = assignments.filter((a) => a.status !== "COMPLETED");
  const done = assignments
    .filter((a) => a.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Work from your coach, soonest due first."
        title="Assignments"
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton className="h-20 rounded-app" key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your assignments. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : assignments.length === 0 ? (
        <EmptyState
          description="When your coach gives you work, it shows up here."
          icon={Target}
          title="No assignments yet"
        />
      ) : (
        <div className="space-y-5">
          <SectionCard title={`To do (${pending.length})`}>
            {pending.length === 0 ? (
              <EmptyState icon={CircleCheck} title="You're all caught up" variant="inline" />
            ) : (
              <AssignmentList items={pending} />
            )}
          </SectionCard>
          {done.length > 0 ? (
            <SectionCard title={`Completed (${done.length})`}>
              <AssignmentList items={done} />
            </SectionCard>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AssignmentList({ items }: { items: StudentAssignmentItem[] }) {
  return (
    <ul className="divide-y divide-app-border">
      {items.map((item) => (
        <AssignmentRow item={item} key={item.id} />
      ))}
    </ul>
  );
}

function AssignmentRow({ item }: { item: StudentAssignmentItem }) {
  const timeZone = useUserTimeZone();
  const Icon = ACTIVITY_ICON[item.activityType];
  const completed = item.status === "COMPLETED";
  const meta = [
    ACTIVITY_LABEL[item.activityType],
    DIFFICULTY_LABEL[item.difficulty],
    item.coachName ? `Coach ${item.coachName}` : null,
    completed && item.completedAt ? `Completed ${formatFullDate(item.completedAt, timeZone)}` : null,
    completed && item.bestScorePercent !== null ? `Best ${item.bestScorePercent}%` : null
  ];

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid={`assignment-${item.id}`}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-muted">
        <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-sm font-semibold text-app-text">{item.title}</span>
          {completed ? null : (
            <DueBadge dueDate={item.dueDate} formatted={formatFullDate(item.dueDate, timeZone)} timeZone={timeZone} />
          )}
          {item.status === "IN_PROGRESS" ? <StatusBadge status={item.status} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-app-muted">{meta.filter(Boolean).join(" · ")}</p>
        {item.puzzleSet ? <PuzzleSetProgressLine set={item.puzzleSet} /> : null}
      </div>

      <div className="flex w-full justify-end sm:w-auto">
        <Button asChild size="sm" variant="outline">
          <Link href={`/student/practice/${item.id}`}>
            {item.status === "PENDING" ? "Start" : item.status === "IN_PROGRESS" ? "Resume" : "Review"}
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      </div>
    </li>
  );
}

/** "4 of 10 done · 3 solved · 27 / 100 pts" with a slim bar — the set's progress at a glance. */
function PuzzleSetProgressLine({ set }: { set: StudentPuzzleSetProgress }) {
  const total = set.puzzles.length;
  const { attemptedCount, maxPoints, points, solvedCount } = set.self;
  return (
    <div className="mt-2 max-w-sm space-y-1">
      <p className="text-xs text-app-muted">
        {attemptedCount} of {total} done · {solvedCount} solved · {points} / {maxPoints} pts
        {set.self.rank !== null ? ` · #${set.self.rank}` : ""}
      </p>
      <div
        aria-label="Puzzles finished"
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={attemptedCount}
        className="h-1.5 overflow-hidden rounded-full bg-app-soft"
        role="progressbar"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${total ? Math.round((attemptedCount / total) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}
