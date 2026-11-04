"use client";

import { Clock, GraduationCap } from "lucide-react";
import Link from "next/link";
import type { CoachClass, CoachClassStudent } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";
import { Avatar } from "@/components/ui/Avatar";
import { ClassBatchTypeSelect } from "./ClassBatchTypeSelect";
import { ClassTopicEditor } from "./ClassTopicEditor";
import { StartClassButton } from "./StartClassButton";

const STUDENTS_SHOWN = 3;

const LEVEL_LABELS: Record<NonNullable<CoachClass["level"]>, string> = {
  ADVANCED: "Advanced",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  MIXED: "Mixed levels"
};

function fullName(student: Pick<CoachClassStudent, "firstName" | "lastName">) {
  return [student.firstName, student.lastName].filter(Boolean).join(" ");
}


function StudentDetails({ student }: { student: CoachClassStudent }) {
  const details = [
    student.chessRating ? `Rating ${student.chessRating}` : null,
    student.experienceLevel ? LEVEL_LABELS[student.experienceLevel] : null
  ].filter(Boolean);

  return (
    <li className="flex min-w-0 items-center gap-3">
      <Avatar name={fullName(student)} imageUrl={student.avatarUrl} className="size-9 text-xs" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">{fullName(student)}</span>
        {details.length > 0 ? (
          <span className="block truncate text-xs text-app-muted">{details.join(" · ")}</span>
        ) : null}
      </span>
    </li>
  );
}

/** One of the coach's next classes, with inline topic / class-type edits and Start. */
export function UpcomingClassCard({ classItem }: { classItem: CoachClass }) {
  const timeZone = useUserTimeZone();
  const subject = classItem.title || classItem.batchName;
  const hiddenStudents = classItem.students.length - STUDENTS_SHOWN;

  return (
    <Card className="flex flex-col gap-4 p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
          <span className="text-xs font-semibold leading-none text-app-muted">
            {formatMonthShort(classItem.startsAt, timeZone)}
          </span>
          <span className="mt-0.5 text-base font-bold leading-none tabular-nums text-app-text">
            {formatDayOfMonth(classItem.startsAt, timeZone)}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-app-muted">
            {formatRelativeDay(classItem.startsAt, timeZone)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-app-text">
            <Clock aria-hidden="true" className="size-3.5 shrink-0 text-app-muted" strokeWidth={2.5} />
            <span>
              <span className="whitespace-nowrap">{formatTime(classItem.startsAt, timeZone)}</span> –{" "}
              <span className="whitespace-nowrap">{formatTime(classItem.endsAt, timeZone)}</span>
            </span>
          </p>
        </div>
        {classItem.status !== "SCHEDULED" ? (
          <ClassStatusBadge className="shrink-0" endsAt={classItem.endsAt} status={classItem.status} />
        ) : null}
      </div>

      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold leading-snug text-app-text">{subject}</h3>
        {classItem.title ? (
          <p className="truncate text-sm text-app-muted">{classItem.batchName}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <BatchTypeBadge type={classItem.batchType} />
          {classItem.level ? (
            <Badge variant="outline">
              <GraduationCap aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              {LEVEL_LABELS[classItem.level]}
            </Badge>
          ) : null}
        </div>
      </div>

      <ClassTopicEditor classItem={classItem} />
      <ClassBatchTypeSelect classItem={classItem} />

      <div>
        <p className="mb-2 text-xs font-semibold text-app-muted">
          {classItem.students.length === 1 ? "Student" : `Students (${classItem.students.length})`}
        </p>
        {classItem.students.length === 0 ? (
          <p className="text-sm text-app-muted">No students enrolled yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {classItem.students.slice(0, STUDENTS_SHOWN).map((student) => (
              <StudentDetails key={student.id} student={student} />
            ))}
            {hiddenStudents > 0 ? (
              <li className="pl-12 text-xs font-semibold text-app-muted">+{hiddenStudents} more</li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-app-border pt-4">
        <StartClassButton classItem={classItem} quiet />
        <Button asChild variant="outline">
          <Link aria-label={`View class: ${subject}`} href={`/classes/${classItem.id}`}>
            View class
          </Link>
        </Button>
      </div>
    </Card>
  );
}
