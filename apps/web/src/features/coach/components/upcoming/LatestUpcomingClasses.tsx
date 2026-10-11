"use client";

import { CalendarClock } from "lucide-react";
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
    <section aria-labelledby="latest-upcoming-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-app-text" id="latest-upcoming-heading">
          Latest Upcoming Classes
        </h2>
        <Button asChild variant="ghost">
          <Link href="/coach/schedule">View All</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SHOWN }).map((_, i) => (
            <Card className="h-[26rem] p-4" key={i}>
              <Skeleton className="h-full w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your upcoming classes. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : classes.length === 0 ? (
        <Card className="p-6 sm:p-12">
          <EmptyState
            action={{ label: "View Schedule", onClick: () => router.push("/coach/schedule") }}
            description="Classes the academy schedules for you will show up here."
            icon={CalendarClock}
            title="No upcoming classes"
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => (
            <UpcomingClassCard classItem={cls} key={cls.id} />
          ))}
        </div>
      )}
    </section>
  );
}
