"use client";

import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
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

  return (
    <div
      className="h-full rounded-2xl border p-4 sm:p-6 flex flex-col transition-colors duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
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
          className="inline-flex items-center gap-1 text-xs font-bold hover:underline text-nx-muted-strong hover:text-nx-ink"
        >
          <span>View all</span>
          <ArrowRight className="size-3.5" strokeWidth={2.3} aria-hidden="true" />
        </Link>
      </div>

      {/* Body */}
      {practices.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <div
            className="size-10 rounded-xl border flex items-center justify-center mb-2.5 bg-nx-tile border-nx-line text-nx-faint"
          >
            <ClipboardList className="size-5" strokeWidth={1.8} />
          </div>
          <p
            className="text-xs text-nx-muted"
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
                    className="text-xs text-nx-muted"
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