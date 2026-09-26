"use client";

import type { ReactNode } from "react";
import { MessageSquareHeart } from "lucide-react";
import type { PendingFeedbackItem } from "@nexa-chess/types";
import { Card, CardContent } from "@/components/ui/Card";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { FeedbackQuestionnaire } from "./FeedbackQuestionnaire";

/**
 * Heading line for a pending request: which coach, and which class if any.
 * `renderTitle` lets a dialog use its own title element as the heading.
 */
export function FeedbackItemHeading({
  item,
  renderTitle
}: {
  item: PendingFeedbackItem;
  renderTitle?: (className: string, text: string) => ReactNode;
}) {
  const titleClass = "text-base font-extrabold text-app-text";
  const tz = useUserTimeZone();
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/[0.12]">
        <MessageSquareHeart aria-hidden="true" className="size-5 text-primary" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        {renderTitle ? renderTitle(titleClass, item.formTitle) : <h2 className={titleClass}>{item.formTitle}</h2>}
        <p className="text-sm text-app-muted">
          About <span className="font-semibold text-app-text">{item.coachName}</span>
          {item.classTitle ? <> &middot; {item.classTitle}</> : null}
          {item.classEndedAt ? <> &middot; {formatFullDate(item.classEndedAt, tz)}</> : null}
        </p>
        {item.formDescription ? (
          <p className="mt-1 text-sm text-app-muted">{item.formDescription}</p>
        ) : null}
      </div>
    </div>
  );
}

/** A pending request rendered inline as a card (dashboard card / class-end screen). */
export function FeedbackItemCard({ item, onDone }: { item: PendingFeedbackItem; onDone?: () => void }) {
  return (
    <Card className="border-primary/30 bg-app-surface shadow-card">
      <CardContent className="grid gap-5 p-5 sm:p-6">
        <FeedbackItemHeading item={item} />
        <FeedbackQuestionnaire item={item} onDone={onDone} />
      </CardContent>
    </Card>
  );
}
