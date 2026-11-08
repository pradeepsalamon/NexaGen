"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUpcomingClasses } from "../../hooks/useCoachApi";
import { UpcomingClassCard } from "./UpcomingClassCard";

const SHOWN = 3;

/** Coach dashboard: the next three classes that are not over yet, soonest first. */
export function LatestUpcomingClasses() {
  const router = useRouter();
  const { data, error, isLoading, refetch } = useUpcomingClasses(SHOWN);
  const classes = data?.classes ?? [];

  return (
    <section aria-labelledby="latest-upcoming-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-app-text" id="latest-upcoming-heading">
            Upcoming classes
          </h2>
          <p className="mt-0.5 text-sm text-app-muted">Set each class&apos;s topic and type before it starts.</p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/coach/schedule">
            View all
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SHOWN }).map((_, i) => (
            <Skeleton className="h-96 rounded-app" key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your upcoming classes. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState variant="inline"
            action={{ label: "View schedule", onClick: () => router.push("/coach/schedule") }}
            description="Classes the academy schedules for you will show up here."
            illustration="schedule"
            title="No upcoming classes"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => (
            <UpcomingClassCard classItem={cls} key={cls.id} />
          ))}
        </div>
      )}
    </section>
  );
}
