"use client";

import { MessageSquareHeart } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMyFeedbackQuery } from "../hooks/useFeedbackApi";
import { FeedbackResponseCard } from "./FeedbackResponseCard";
import { RatingBreakdown } from "./RatingBreakdown";
import { StarRatingDisplay } from "./StarRating";

/** A coach's own ratings. Every response here is anonymous by design. */
export function CoachFeedbackClient() {
  const { data, error, isLoading, refetch } = useMyFeedbackQuery();

  return (
    <div className="grid gap-6 pb-10">
      <PageHeader
        description="What your students say about your classes. Responses are anonymous."
        title="My feedback"
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <Skeleton className="h-56 rounded-panel" />
          <Skeleton className="h-56 rounded-panel" />
        </div>
      ) : error || !data ? (
        <WidgetError onRetry={() => refetch()} />
      ) : data.summary.responseCount === 0 ? (
        <Card className="p-6">
          <EmptyState variant="inline"
            description="Once students rate your classes, your average and their comments will appear here."
            icon={MessageSquareHeart}
            title="No feedback yet"
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
            <Card className="grid content-start gap-4 p-5">
              <p className="text-xs font-bold text-app-muted">Your rating</p>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-black tabular-nums text-app-text">
                  {data.summary.averageRating?.toFixed(1) ?? "—"}
                </span>
                <div className="pb-1.5">
                  <StarRatingDisplay size="md" value={data.summary.averageRating} />
                  <p className="text-xs text-app-muted">
                    from {data.summary.responseCount} rating{data.summary.responseCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <RatingBreakdown distribution={data.summary.distribution} />
            </Card>

            <SectionCard description="Average for each rated question." title="By question">
              {data.questions.length === 0 ? (
                <p className="text-sm text-app-muted">No star-rated questions answered yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {data.questions.map((q) => (
                    <li className="flex flex-wrap items-center justify-between gap-2" key={`${q.questionId}-${q.questionLabel}`}>
                      <span className="min-w-0 flex-1 text-sm text-app-text">{q.questionLabel}</span>
                      <span className="flex items-center gap-2">
                        <StarRatingDisplay value={q.averageRating} />
                        <span className="w-8 text-right text-sm font-bold tabular-nums text-app-text">
                          {q.averageRating.toFixed(1)}
                        </span>
                        <span className="w-10 text-right text-xs text-app-muted">({q.count})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <section className="grid gap-3">
            <h2 className="text-base font-extrabold text-app-text">Recent feedback</h2>
            {data.recent.map((response) => (
              <FeedbackResponseCard key={response.id} response={response} showCoach={false} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
