"use client";

import {
  PLAY_SOURCE_LABELS,
  PLAY_SOURCES,
  type PlayItemSummary,
  type PlayReviewSummary,
  type PlaySource
} from "@nexa-chess/types";
import { Activity, Crosshair, Gauge, Swords } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { usePlayFeed, usePlayRollup } from "../hooks/usePlayReviewApi";
import { AiReviewConsentCard } from "./AiReviewConsentCard";
import { PlayItemDialog } from "./PlayItemDialog";

const SOURCE_OPTIONS = [
  { label: "Everywhere", value: "" },
  ...PLAY_SOURCES.map((source) => ({ label: PLAY_SOURCE_LABELS[source], value: source }))
];

export function ReviewBadge({ review }: { review: PlayReviewSummary | null }) {
  if (!review) return <Badge variant="secondary">Review tonight</Badge>;
  if (review.status === "SKIPPED") return <Badge variant="outline">Nothing to review</Badge>;
  if (review.status === "FAILED") return <Badge variant="warning">Review failed</Badge>;
  const errors = review.blunders + review.mistakes;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {review.accuracy !== null ? <Badge variant="info">{review.accuracy}% accuracy</Badge> : null}
      {errors > 0 ? (
        <Badge variant={review.blunders > 0 ? "destructive" : "warning"}>
          {errors} {errors === 1 ? "mistake" : "mistakes"}
        </Badge>
      ) : (
        <Badge variant="success">Clean</Badge>
      )}
      {review.missedTactics > 0 ? <Badge variant="accent">{review.missedTactics} missed tactic{review.missedTactics === 1 ? "" : "s"}</Badge> : null}
    </span>
  );
}

function FeedRow({ item, onOpen }: { item: PlayItemSummary; onOpen: () => void }) {
  const tz = useUserTimeZone();
  return (
    <li>
      <button
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-app px-3 py-3 text-left transition-colors hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
        onClick={onOpen}
        type="button"
      >
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate text-sm font-semibold text-app-text">{item.title}</span>
          <span className="block text-xs text-app-muted">
            {PLAY_SOURCE_LABELS[item.source]} · {formatDateTime(item.playedAt, tz)} · {item.studentMoveCount}{" "}
            {item.studentMoveCount === 1 ? "move" : "moves"}
            {item.result ? ` · ${item.result}` : ""}
          </span>
        </span>
        <ReviewBadge review={item.review} />
      </button>
    </li>
  );
}

/**
 * "Board play" (docs/AI_PLAY_REVIEW.md): every board move the student played
 * anywhere in the app, newest first, with the nightly engine review of each.
 * `studentId` null = the signed-in student; otherwise staff. Both see the
 * outside-AI switch (staff may change it after a parent agreed).
 */
export function BoardPlayPanel({ studentId }: { studentId: string | null }) {
  const [source, setSource] = useState<PlaySource | undefined>(undefined);
  const [open, setOpen] = useState<PlayItemSummary | null>(null);
  const feed = usePlayFeed(studentId, source);
  const rollup = usePlayRollup(studentId);
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      {rollup.data ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile context="Last 7 days" icon={Activity} label="Reviewed" tone="primary" value={String(rollup.data.reviewed)} />
          <StatTile
            context="Last 7 days"
            icon={Gauge}
            label="Average accuracy"
            tone="secondary"
            value={rollup.data.averageAccuracy === null ? "–" : `${rollup.data.averageAccuracy}%`}
          />
          <StatTile
            context="Last 7 days"
            icon={Swords}
            label="Most played"
            tone="accent"
            value={rollup.data.bySource[0] ? PLAY_SOURCE_LABELS[rollup.data.bySource[0].source] : "–"}
          />
          <StatTile context="Last 7 days" icon={Crosshair} label="Top theme" tone="warm" value={rollup.data.themes[0]?.label ?? "–"} />
        </div>
      ) : rollup.isLoading ? (
        <Skeleton className="h-28 w-full rounded-app" />
      ) : null}

      <AiReviewConsentCard compact studentId={studentId} />

      <section className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-lg font-bold text-app-text">Board play</h2>
            <p className="text-sm text-app-muted">
              Every game, puzzle and class move, newest first. Our chess engine reviews new play each night.
            </p>
          </div>
          <div className="w-full sm:w-52">
            <Select
              aria-label="Where it was played"
              onChange={(e) => setSource((e.target.value || undefined) as PlaySource | undefined)}
              options={SOURCE_OPTIONS}
              value={source ?? ""}
            />
          </div>
        </div>

        <div className="mt-3">
          {feed.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton className="h-14 w-full rounded-app" key={i} />
              ))}
            </div>
          ) : feed.isError ? (
            <WidgetError message={feed.error?.message} onRetry={() => void feed.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              description={source ? "Nothing played there yet." : "Games, puzzles and class moves show up here once they're played."}
              title="No board play yet"
              variant="inline"
            />
          ) : (
            <>
              <ul className="divide-y divide-app-border">
                {items.map((item) => (
                  <FeedRow item={item} key={item.key} onOpen={() => setOpen(item)} />
                ))}
              </ul>
              <InfiniteScrollTrigger className="mt-3" endLabel="That's everything." query={feed} />
            </>
          )}
        </div>
      </section>

      <PlayItemDialog item={open} onClose={() => setOpen(null)} studentId={studentId} />
    </div>
  );
}
