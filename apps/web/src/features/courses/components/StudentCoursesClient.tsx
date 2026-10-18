"use client";

import Link from "next/link";
import { GraduationCap, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyCourses } from "../hooks/useCoursesApi";

export function StudentCoursesClient() {
  const { data, isLoading } = useMyCourses();
  const courses = data?.courses ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">My courses</h1>
        <p className="mt-1 text-sm text-app-muted">
          Curated playlists of assignments and puzzles picked by your coaches.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Your coaches haven't published any courses yet — check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col gap-3 p-4">
              <div>
                <h2 className="font-extrabold tracking-tight text-app-text">{course.title}</h2>
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
                    className="h-full rounded-full bg-gradient-to-r from-warm to-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${course.progressPercent}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-extrabold text-app-text">
                  {course.progressPercent}%
                </span>
              </div>
              <p className="text-xs text-app-muted">
                {course.completedModuleCount} of {course.moduleCount} modules complete
              </p>

              <Button asChild size="sm">
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
