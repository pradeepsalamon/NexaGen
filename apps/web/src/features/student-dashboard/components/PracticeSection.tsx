"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface PracticeItem {
  id: string;
  title: string;
  dueDate: string;
  // Accept both the legacy Title Case values and the API enum casing.
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
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");
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
        <Button asChild size="sm" variant="ghost">
          <Link className="text-primary-ink" href="/student/practice">
            View all
            <ArrowRight className="ml-1 size-4" strokeWidth={2.5} aria-hidden="true" />
          </Link>
        </Button>
      }
      className="h-full"
      title="Assignments"
    >
      {practices.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">
          You&apos;re all caught up. New work from your coach lands here.
        </p>
      ) : (
        <ul className="-my-2 divide-y divide-app-border">
          {practices.map((practice) => (
            <li className="flex items-center justify-between gap-3 py-3" key={practice.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-app-text">{practice.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={DIFFICULTY_VARIANT[practice.difficulty.toLowerCase()] ?? "outline"}
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
