"use client";

import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
import { formatFullDate } from "@/lib/datetime";

interface PracticeItem {
  id: string;
  title: string;
  dueDate: string;
  difficulty: string;
  status: string;
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const DIFFICULTY_VARIANT: Record<string, BadgeVariant> = {
  beginner: "success",
  intermediate: "warning",
  advanced: "info"
};

function titleCase(value: string) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1).toLowerCase().replace(/_/g, " ")
  );
}

const isCompleted = (status: string) =>
  status.toLowerCase().replace(/[ _]/g, "") === "completed";
const isPending = (status: string) => status.toLowerCase() === "pending";

interface PracticeSectionProps {
  practices?: PracticeItem[];
}

export function PracticeSection({ practices = [] }: PracticeSectionProps) {
  const timeZone = useUserTimeZone();
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <div
      className={`h-full rounded-2xl border p-4 sm:p-6 flex flex-col transition-colors duration-200 ${isDark
          ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
        }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border ${isDark
                ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
              }`}
          >
            <ClipboardList
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.1}
            />
          </span>
          <h2 className="text-sm sm:text-base font-bold">Assignments</h2>
        </div>

        <Link
          href="/student/practice"
          className={`inline-flex items-center gap-1 text-xs font-bold hover:underline ${isDark
              ? "text-[#94A3B8] hover:text-white"
              : "text-[#475569] hover:text-[#071B41]"
            }`}
        >
          <span>View all</span>
          <ArrowRight className="size-3.5" strokeWidth={2.3} aria-hidden="true" />
        </Link>
      </div>

      {/* Body */}
      {practices.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <div
            className={`size-10 rounded-xl border flex items-center justify-center mb-2.5 ${isDark
                ? "bg-[#0B1B38] border-white/10 text-[#64748B]"
                : "bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8]"
              }`}
          >
            <ClipboardList className="size-5" strokeWidth={1.8} />
          </div>
          <p
            className={`text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
              }`}
          >
            You&apos;re all caught up. New work from your coach lands here.
          </p>
        </div>
      ) : (
        <ul className="-my-2 divide-y divide-app-border">
          {practices.map((practice) => (
            <li
              className="flex items-center justify-between gap-3 py-3"
              key={practice.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{practice.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      DIFFICULTY_VARIANT[practice.difficulty.toLowerCase()] ??
                      "outline"
                    }
                  >
                    {titleCase(practice.difficulty)}
                  </Badge>
                  <span
                    className={`text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                      }`}
                  >
                    Due {formatFullDate(practice.dueDate, timeZone)}
                  </span>
                </div>
              </div>

              <Button asChild className="shrink-0" size="sm" variant="outline">
                <Link href={`/student/practice/${practice.id}`}>
                  {isPending(practice.status)
                    ? "Start"
                    : isCompleted(practice.status)
                      ? "Result"
                      : "Resume"}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}