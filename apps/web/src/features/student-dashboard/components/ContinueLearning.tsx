"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

interface CourseProgress {
  id: string;
  title: string;
  module: string;
  progressPercent: number;
  lastOpenedAt: string;
}

interface ContinueLearningProps {
  courses: CourseProgress[];
}

export function ContinueLearning({ courses }: ContinueLearningProps) {
  return (
    <div
      className="h-full rounded-2xl border p-4 sm:p-6 transition-colors duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
        >
          <BookOpen aria-hidden="true" className="size-4" strokeWidth={2.1} />
        </span>
        <h2 className="text-sm sm:text-base font-bold">Continue learning</h2>
      </div>

      <ul
        className="-my-2 divide-y divide-nx-line"
      >
        {courses.map((course) => (
          <li key={course.id}>
            <Link
              className="-mx-2 block rounded-xl px-2 py-3 transition-colors hover:bg-nx-tile-faint"
              href={`/student/courses/${course.id}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold">
                  {course.title}
                </span>
                <span className="shrink-0 text-xs font-bold text-nx-gold-ink">
                  {course.progressPercent}%
                </span>
              </span>
              <span
                className="mt-0.5 block truncate text-xs text-nx-muted"
              >
                {course.module}
              </span>
              <span
                aria-label={`${course.progressPercent}% complete`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={course.progressPercent}
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-nx-line"
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-nx-gold-300 to-nx-gold-700"
                  style={{ width: `${course.progressPercent}%` }}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}