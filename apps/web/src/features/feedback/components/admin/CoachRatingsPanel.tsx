"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useCoachRatingsQuery } from "../../hooks/useFeedbackApi";
import { RatingBreakdown } from "../RatingBreakdown";
import { StarRatingDisplay } from "../StarRating";

export function CoachRatingsPanel({ onViewResponses }: { onViewResponses: (coachId: string) => void }) {
  const tz = useUserTimeZone();
  const { data, error, isLoading, refetch } = useCoachRatingsQuery();

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton className="h-40 rounded-app" key={i} />
        ))}
      </div>
    );
  }
  if (error) return <WidgetError onRetry={() => refetch()} />;

  const coaches = data?.coaches ?? [];
  if (coaches.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState description="There are no active coaches to rate yet." icon={Star} title="No coaches" />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {coaches.map((coach) => (
        <Card className="grid gap-4 p-4 sm:p-5" key={coach.coachId}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold text-app-text">{coach.coachName}</h3>
              <p className="text-xs text-app-muted">
                {coach.responseCount} rating{coach.responseCount === 1 ? "" : "s"}
                {coach.lastResponseAt ? ` · last ${formatFullDate(coach.lastResponseAt, tz)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-app-text">
                {coach.averageRating !== null ? coach.averageRating.toFixed(1) : "—"}
              </p>
              <StarRatingDisplay value={coach.averageRating} />
            </div>
          </div>
          {coach.responseCount > 0 ? (
            <>
              <RatingBreakdown distribution={coach.distribution} />
              <Button
                className="w-fit px-0 text-primary"
                onClick={() => onViewResponses(coach.coachId)}
                type="button"
                variant="ghost"
              >
                View responses
              </Button>
            </>
          ) : (
            <p className="text-sm text-app-muted">No feedback yet.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
