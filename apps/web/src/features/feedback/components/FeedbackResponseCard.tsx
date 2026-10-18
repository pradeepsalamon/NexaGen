import type { FeedbackResponseDto } from "@nexa-chess/types";
import { Card } from "@/components/ui/Card";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { StarRatingDisplay } from "./StarRating";

/** One submitted response. `studentName` is null in the coach's anonymous view. */
export function FeedbackResponseCard({ response, showCoach = true }: { response: FeedbackResponseDto; showCoach?: boolean }) {
  const tz = useUserTimeZone();
  return (
    <Card className="grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-app-text">
            {response.studentName ?? "Anonymous student"}
            {showCoach ? (
              <span className="font-normal text-app-muted"> about {response.coachName}</span>
            ) : null}
          </p>
          <p className="text-xs text-app-muted">
            {response.formTitle}
            {response.classTitle ? <> &middot; {response.classTitle}</> : null} &middot;{" "}
            {formatFullDate(response.createdAt, tz)}
          </p>
        </div>
        {response.overallRating !== null ? (
          <div className="flex items-center gap-1.5">
            <StarRatingDisplay value={response.overallRating} />
            <span className="text-sm font-bold tabular-nums text-app-text">{response.overallRating.toFixed(1)}</span>
          </div>
        ) : null}
      </div>
      <dl className="grid gap-2">
        {response.answers.map((answer) => (
          <div className="grid gap-0.5" key={answer.questionId}>
            <dt className="text-xs font-semibold text-app-muted">{answer.questionLabel}</dt>
            <dd className="text-sm text-app-text">
              {answer.ratingValue !== null ? (
                <StarRatingDisplay value={answer.ratingValue} />
              ) : (
                <span className="whitespace-pre-line break-words">{answer.textValue}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
