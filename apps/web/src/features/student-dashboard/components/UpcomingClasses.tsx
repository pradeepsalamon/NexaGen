"use client";

import { ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";
import type { StudentDashboardUpcomingClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassRow, ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";

interface UpcomingClassesProps {
  classes?: StudentDashboardUpcomingClass[];
}

export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  return (
    <SectionCard
      actions={
        <Button asChild className="-mr-3" size="sm" variant="ghost">
          <Link href="/student/schedule">
            View all
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      }
      description="You can join once your coach starts the class."
      title="Upcoming classes"
    >
      {classes.length === 0 ? (
        <EmptyState icon={Calendar} title="Nothing scheduled yet" variant="inline" />
      ) : (
        <ClassRowList>
          {classes.map((cls) => (
            <ClassRow badges={<BatchTypeBadge type={cls.batchType} />} cls={cls} key={cls.id} quietJoin />
          ))}
        </ClassRowList>
      )}
    </SectionCard>
  );
}
