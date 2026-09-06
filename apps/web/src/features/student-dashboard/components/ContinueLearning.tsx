"use client";

import { Clock, GraduationCap, PlayCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Panel, PanelEmpty, PanelHeader, PanelList, PanelRow } from "@/components/ui/Panel";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface CourseProgress {
  id: string;
  title: string;
  module: string;
  progressPercent: number;
  lastOpenedAt: string;
}

interface ContinueLearningProps {
  courses?: CourseProgress[];
}

export function ContinueLearning({ courses = [] }: ContinueLearningProps) {
  const timeZone = useUserTimeZone();

  return (
    <Panel className="h-full">
      <PanelHeader icon={GraduationCap} title="Continue Learning" tone="warm" />
      {courses.length === 0 ? (
        <PanelEmpty
          action={
            <Button asChild variant="outline">
              <Link href="/student/courses">Browse courses</Link>
            </Button>
          }
          icon={GraduationCap}
          message="Enroll in a course and your progress will show up here."
          title="No courses yet"
          tone="warm"
        />
      ) : (
        <PanelList>
          {courses.map((course) => (
            <PanelRow className="md:flex-row md:items-center" key={course.id} tone="warm">
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-extrabold tracking-tight text-app-text">
                    {course.title}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-app-muted">
                    <span className="rounded-full bg-warm/25 px-2 py-0.5 text-xs font-extrabold text-warm-ink">
                      {course.module}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                      {formatFullDate(course.lastOpenedAt, timeZone)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    aria-label={`${course.progressPercent}% complete`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={course.progressPercent}
                    className="h-2 flex-1 overflow-hidden rounded-full bg-app-soft"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-warm to-primary transition-[width] duration-700 ease-out"
                      style={{ width: `${course.progressPercent}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-extrabold text-app-text">
                    {course.progressPercent}%
                  </span>
                </div>
              </div>

              <Button asChild className="w-full md:w-auto" size="sm">
                <Link href={`/student/courses/${course.id}`}>
                  <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  Continue
                </Link>
              </Button>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </Panel>
  );
}
