"use client";

import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMyCourses } from "../hooks/useCoursesApi";

export function StudentCoursesClient() {
  const { data, isError, isLoading, refetch } = useMyCourses();
  const courses = data?.courses ?? [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader description="Playlists of lessons and puzzles from your coaches." title="My courses" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-app" />
          ))}
        </div>
      ) : isError && !data ? (
        <WidgetError message="Couldn't load your courses." onRetry={() => void refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState
          illustration="courses"
          title="No courses yet"
          description="Your coaches haven't published any courses yet — check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col gap-3 p-4">
              <div>
                <h2 className="break-words text-base font-semibold text-app-text">{course.title}</h2>
                {course.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-app-muted">{course.description}</p>
                )}
              </div>

              <div className="mt-auto flex items-center gap-3">
                <div
                  aria-label={`${course.progressPercent}% complete`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={course.progressPercent}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-app-soft"
                  role="progressbar"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${course.progressPercent}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-app-text">
                  {course.progressPercent}%
                </span>
              </div>
              <p className="text-xs text-app-muted">
                {course.completedModuleCount} of {course.moduleCount} {course.moduleCount === 1 ? "module" : "modules"} complete
              </p>

              <Button asChild size="sm" variant="outline">
                <Link href={`/student/courses/${course.id}`}>
                  <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  {course.progressPercent > 0 ? "Continue" : "Start"}
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
