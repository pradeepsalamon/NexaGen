"use client";

import { ArrowRight, Target } from "lucide-react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel, PanelEmpty, PanelHeader, PanelList, PanelRow } from "@/components/ui/Panel";
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
    <Panel className="h-full">
      <PanelHeader
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/student/practice">View all</Link>
          </Button>
        }
        icon={Target}
        title="Assignments & Practice"
        tone="secondary"
      />
      {practices.length === 0 ? (
        <PanelEmpty
          icon={Target}
          message="New exercises from your coach will land here."
          title="Nothing to practice"
          tone="secondary"
        />
      ) : (
        <PanelList>
          {practices.map((practice) => (
            <PanelRow
              className="sm:flex-row sm:items-center"
              key={practice.id}
              tone="secondary"
            >
              <div className="min-w-0 space-y-2">
                <h3 className="font-extrabold tracking-tight text-app-text">
                  {practice.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={DIFFICULTY_VARIANT[practice.difficulty.toLowerCase()] ?? "outline"}
                  >
                    {titleCase(practice.difficulty)}
                  </Badge>
                  <span className="text-xs font-bold text-app-muted">
                    Due {formatFullDate(practice.dueDate, timeZone)}
                  </span>
                </div>
              </div>

              <Button
                asChild
                className="group/cta w-full sm:w-auto"
                size="sm"
                variant={isCompleted(practice.status) ? "outline" : "primary"}
              >
                <Link href={`/student/practice/${practice.id}`}>
                  {isPending(practice.status)
                    ? "Start"
                    : isCompleted(practice.status)
                      ? "View result"
                      : "Resume"}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5"
                    strokeWidth={2.5}
                  />
                </Link>
              </Button>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </Panel>
  );
}
