"use client";

import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";

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
    <SectionCard className="h-full" title="Continue learning">
      <ul className="-my-2 divide-y divide-app-border">
        {courses.map((course) => (
          <li key={course.id}>
            <Link
              className="-mx-2 block rounded-control px-2 py-3 transition-colors hover:bg-app-soft"
              href={`/student/courses/${course.id}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold text-app-text">{course.title}</span>
                <span className="shrink-0 text-xs font-bold text-app-text">
                  {course.progressPercent}%
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-app-muted">
                {course.module}
              </span>
              <span
                aria-label={`${course.progressPercent}% complete`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={course.progressPercent}
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-app-soft"
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${course.progressPercent}%` }}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
