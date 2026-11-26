"use client";

import { PLAY_SOURCE_LABELS, type WeakSpotExample, type WeakSpotMotif, type WeakSpotTrend } from "@nexa-chess/types";
import { BookOpenCheck, ClipboardPlus, Crosshair } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { PuzzleBoardTile } from "@/features/live-class/components/meeting/PuzzleBoardTile";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayMonth } from "@/lib/datetime";
import { useRouter } from "@/lib/navigation";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { useMakeWeakSpotHomework, useWeakSpots } from "../hooks/useWeakSpots";
import { WeakSpotTipsDialog } from "./WeakSpotTipsDialog";

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);
const times = (n: number) => (n === 1 ? "once" : `${n} times`);

const TREND: Record<WeakSpotTrend, { label: string; variant: "success" | "warning" | "secondary" }> = {
  BETTER: { label: "Getting better", variant: "success" },
  SAME: { label: "No change", variant: "secondary" },
  WORSE: { label: "Getting worse", variant: "warning" }
};

function TrendBadge({ trend }: { trend: WeakSpotTrend | null }) {
  if (!trend) return null;
  return <Badge variant={TREND[trend].variant}>{TREND[trend].label}</Badge>;
}

function Example({ example }: { example: WeakSpotExample }) {
  const tz = useUserTimeZone();
  const orientation = example.fen.split(" ")[1] === "b" ? "black" : "white";
  return (
    <figure className="grid min-w-0 gap-2">
      <PuzzleBoardTile
        bestMove={example.bestMoveUci ?? undefined}
        fen={example.fen}
        orientation={orientation}
        wrongMove={example.playedUci ?? undefined}
      />
      <figcaption className="text-xs text-app-muted">
        <span className="font-semibold text-app-text">Played {example.playedSan}</span>
        {example.bestMoveSan ? <>, {example.bestMoveSan} was there</> : null}
        <span className="block">
          {PLAY_SOURCE_LABELS[example.source]} · {formatDayMonth(example.playedAt, tz)}
        </span>
      </figcaption>
    </figure>
  );
}

/** Make homework (WS-5): a puzzle set for this weak spot, opened in the assignments page to edit and assign. */
function MakeHomeworkButton({ spot, studentId }: { spot: WeakSpotMotif; studentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const role = useAuthStore((state) => state.user?.role);
  const make = useMakeWeakSpotHomework(studentId);
  if (spot.practiceThemes.length === 0) return null;
  const base = role === "COACH" ? "/coach/assignments" : "/admin/assignments";
  return (
    <Button
      isLoading={make.isPending}
      onClick={() =>
        make.mutate(
          { motif: spot.motif },
          {
            onError: (e) => toast.error({ message: getErrorMessage(e), title: "Couldn't make the homework" }),
            onSuccess: (result) => {
              toast.success({
                message: "Check the puzzles, then assign it to a batch. Nobody has it yet.",
                title: `${result.title}: ${result.puzzleCount} puzzles saved`
              });
              router.push(`${base}?edit=${encodeURIComponent(result.assignmentId)}`);
            }
          }
        )
      }
      size="sm"
      type="button"
      variant="outline"
    >
      <ClipboardPlus aria-hidden className="size-4" />
      Make homework
    </Button>
  );
}

function WeakSpotCard({ spot, studentId }: { spot: WeakSpotMotif; studentId: string }) {
  const where = spot.bySource.map((s) => `${PLAY_SOURCE_LABELS[s.source]} ${s.missed}`).join(" · ");
  return (
    <article className="grid min-w-0 gap-4 rounded-app border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-app-text">{spot.label}</h3>
          <p className="text-xs text-app-muted">
            Missed {spot.missed} of {spot.opportunities} chances, in {spot.itemsWithMiss} different games or boards
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="destructive">{percent(spot.missRate)} missed</Badge>
          <TrendBadge trend={spot.trend} />
        </div>
      </div>
      <div className="grid gap-1">
        <p className="text-sm text-app-text">{spot.tip}</p>
        {spot.tipStatus !== "READ" ? (
          <p className="text-xs text-app-muted">
            {spot.tipStatus === "CHANGED"
              ? "The student doesn't see this tip: its wording changed since it was read."
              : "The student doesn't see this tip until a coach reads it (Tips students see)."}
          </p>
        ) : null}
      </div>
      <dl className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="font-semibold text-app-text">Where</dt>
          <dd className="text-app-muted">{where || "–"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-app-text">In puzzles</dt>
          <dd className="text-app-muted">
            {spot.puzzles
              ? `${spot.puzzles.clean} of ${spot.puzzles.attempts} solved cleanly`
              : spot.practiceThemes.length
                ? "None played yet"
                : "No puzzle theme for this one"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-app-text">Cost</dt>
          <dd className="text-app-muted">
            {spot.averageLoss === null ? "–" : `About ${Math.round(spot.averageLoss)} points of winning chance each time`}
            {spot.allowed > 0 ? `; also handed it to the opponent ${times(spot.allowed)}` : ""}
          </dd>
        </div>
      </dl>
      {spot.examples.length > 0 ? (
        <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
          {spot.examples.map((example) => (
            <Example example={example} key={`${example.source}:${example.sourceId}:${example.segment}:${example.ply}`} />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <MakeHomeworkButton spot={spot} studentId={studentId} />
      </div>
    </article>
  );
}

function MotifRow({ spot }: { spot: WeakSpotMotif }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="min-w-0 text-sm font-semibold text-app-text">{spot.label}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-app-muted">
        {spot.opportunities === 0 ? (
          // Only in reviews from before chances were counted: they fill in overnight.
          <span>Not counted yet</span>
        ) : spot.verdict === "NOT_ENOUGH_DATA" ? (
          <span>
            {spot.opportunities} {spot.opportunities === 1 ? "chance" : "chances"}: not enough to judge
          </span>
        ) : (
          <span>
            Found {spot.found + spot.alternative} of {spot.opportunities}
          </span>
        )}
        {spot.allowed > 0 ? <span>· handed over {times(spot.allowed)}</span> : null}
        <TrendBadge trend={spot.trend} />
      </span>
    </li>
  );
}

/**
 * Weak spots (docs/WEAK_SPOTS.md): what this student keeps missing in all
 * their reviewed play (class board, Storm/Racer, homework, games…), with
 * example positions, their strengths and everything else they met; Make
 * homework per weak spot, and the academy's tip reading list. The student's
 * coach and admins (the student has their own card).
 */
export function WeakSpotsPanel({ studentId }: { studentId: string }) {
  const query = useWeakSpots(studentId);
  const [tipsOpen, setTipsOpen] = useState(false);

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-app" />;
  if (query.isError || !query.data) return <WidgetError message={query.error?.message} onRetry={() => void query.refetch()} />;
  const profile = query.data;
  const pending = profile.reviewedItems - profile.itemsWithStats;

  return (
    <div className="space-y-5">
      {tipsOpen ? <WeakSpotTipsDialog onClose={() => setTipsOpen(false)} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="min-w-0 flex-1 basis-72 text-sm text-app-muted">
        From {profile.reviewedItems} reviewed {profile.reviewedItems === 1 ? "game or board" : "games and boards"} and{" "}
        {profile.puzzleAttempts} {profile.puzzleAttempts === 1 ? "puzzle" : "puzzles"} in the last {profile.windowDays} days. The chess
        engine decides every miss; play is reviewed overnight.
        {pending > 0 ? ` ${pending} older ${pending === 1 ? "review is" : "reviews are"} being checked again overnight and will count after that.` : ""}
      </p>
      <Button onClick={() => setTipsOpen(true)} size="sm" type="button" variant="neutral">
        <BookOpenCheck aria-hidden className="size-4" />
        Tips students see
      </Button>
      </div>

      <SectionCard
        description="What the student keeps missing: at least half of the chances, three or more times, in three or more different games or boards."
        title="Weak spots"
      >
        {profile.weakSpots.length === 0 ? (
          <EmptyState
            description={
              profile.reviewedItems === 0
                ? "No reviewed play in the last 60 days yet."
                : "Nothing is missed often enough yet to call it a weak spot."
            }
            icon={Crosshair}
            title="No weak spot yet"
            variant="inline"
          />
        ) : (
          <div className="grid gap-4">
            {profile.weakSpots.map((spot) => (
              <WeakSpotCard key={spot.motif} spot={spot} studentId={studentId} />
            ))}
          </div>
        )}
      </SectionCard>

      {profile.strengths.length > 0 ? (
        <SectionCard description="Found at least 7 times out of 10." title="Strengths">
          <ul className="divide-y divide-app-border">
            {profile.strengths.map((spot) => (
              <MotifRow key={spot.motif} spot={spot} />
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {profile.others.length > 0 ? (
        <SectionCard collapsible defaultCollapsed description="Every other pattern the student met." title="Everything else">
          <ul className="divide-y divide-app-border">
            {profile.others.map((spot) => (
              <MotifRow key={spot.motif} spot={spot} />
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
