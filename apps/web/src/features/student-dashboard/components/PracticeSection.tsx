"use client";

import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
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
    <SectionCard
      actions={
        <Button asChild className="-mr-3" size="sm" variant="ghost">
          <Link href="/student/practice">
            View all
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      }
      title="Assignments"
    >
      {practices.length === 0 ? (
        <EmptyState
          description="New work from your coach lands here."
          icon={ClipboardList}
          illustration="success"
          title="You're all caught up"
          variant="inline"
        />
      ) : (
        <ul className="divide-y divide-app-border">
          {practices.map((practice) => (
            <li
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              key={practice.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app-text">
                  {practice.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      DIFFICULTY_VARIANT[practice.difficulty.toLowerCase()] ??
                      "outline"
                    }
                  >
                    {titleCase(practice.difficulty)}
                  </Badge>
                  <span className="text-xs text-app-muted">
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
    </SectionCard>
  );
}
