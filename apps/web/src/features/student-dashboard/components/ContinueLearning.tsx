"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <div
      className={`h-full rounded-2xl border p-4 sm:p-6 transition-colors duration-200 ${isDark
          ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
        }`}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={`flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border ${isDark
              ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
              : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
            }`}
        >
          <BookOpen aria-hidden="true" className="size-4" strokeWidth={2.1} />
        </span>
        <h2 className="text-sm sm:text-base font-bold">Continue learning</h2>
      </div>

      <ul
        className={`-my-2 divide-y ${isDark ? "divide-white/8" : "divide-[#EEF2F7]"
          }`}
      >
        {courses.map((course) => (
          <li key={course.id}>
            <Link
              className={`-mx-2 block rounded-xl px-2 py-3 transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-[#F8FAFC]"
                }`}
              href={`/student/courses/${course.id}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold">
                  {course.title}
                </span>
                <span className="shrink-0 text-xs font-bold text-[#C58927] dark:text-[#E2B355]">
                  {course.progressPercent}%
                </span>
              </span>
              <span
                className={`mt-0.5 block truncate text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                  }`}
              >
                {course.module}
              </span>
              <span
                aria-label={`${course.progressPercent}% complete`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={course.progressPercent}
                className={`mt-2 block h-1.5 overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-[#EEF2F7]"
                  }`}
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-[#E6B960] to-[#CC922C]"
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