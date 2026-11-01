"use client";

import { Check } from "lucide-react";
import {
  describePlayoutGoal,
  MCQ_REVEAL_MODE_LABELS,
  playoutEngineLabel,
  type LibraryActivityDto,
  type McqConfig,
  type PlayoutConfig
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ActivityContent } from "@/features/live-class/components/meeting/activity-run/ActivityContent";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { PuzzleBoardTile } from "@/features/live-class/components/meeting/PuzzleBoardTile";
import { cn } from "@/lib/utils";
import { useActivity } from "../../hooks/useActivitiesApi";
import { PUZZLE_DIFFICULTY_LABELS, difficultyBadgeVariant } from "../../lib/puzzleMeta";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-app-muted">{label}</dt>
          <dd className="font-semibold text-app-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function McqPreview({ config }: { config: McqConfig }) {
  return (
    <div className="space-y-3">
      <ActivityContent content={config.question} imageAlt="The question" textClassName="font-semibold text-app-text" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {config.options.map((option, index) => (
          <li
            key={option.id}
            className={cn(
              "flex items-start gap-2 rounded-app border p-2 text-sm text-app-text",
              option.isCorrect ? "border-success bg-success/10" : "border-app-border"
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold">
              {option.isCorrect ? <Check className="size-3.5 text-success-ink" strokeWidth={3} aria-label="Correct answer" /> : LETTERS[index]}
            </span>
            <div className="min-w-0 flex-1">
              <ActivityContent content={option} imageAlt={`Answer ${LETTERS[index]}`} boardClassName="max-w-[180px]" />
            </div>
          </li>
        ))}
      </ul>
      {config.explanation ? <p className="rounded-app bg-app-soft p-2 text-sm text-app-text">{config.explanation}</p> : null}
      <Facts
        items={[
          ["Marks", String(config.marks)],
          ["Tries", String(config.maxAttempts)],
          ["Timer", config.timeLimitSeconds ? `${config.timeLimitSeconds}s` : "None"],
          ["Answer shown", MCQ_REVEAL_MODE_LABELS[config.revealMode]],
          ["Answers", config.allowMultiple ? "Several correct" : "One correct"],
          ["Shuffled", config.randomizeOptions ? "Yes" : "No"]
        ]}
      />
    </div>
  );
}

function PlayoutPreview({ config }: { config: PlayoutConfig }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <PuzzleBoardTile fen={config.startFen} orientation={config.studentColor} />
      <div className="min-w-0 space-y-3">
        <p className="font-semibold text-app-text">{config.goalDescription?.trim() || describePlayoutGoal(config.goal)}</p>
        <Facts
          items={[
            ["Student plays", config.studentColor === "white" ? "White" : "Black"],
            ["Computer", playoutEngineLabel(config.engine.skillLevel)],
            ["Tries", String(config.maxAttempts)],
            ["Timer", config.timeLimitSeconds ? `${config.timeLimitSeconds}s` : "None"],
            ["Points", String(config.scoring.goalPoints)],
            ["Hints", String(config.hints.length)]
          ]}
        />
        <p className="break-all text-xs text-app-muted">{config.startFen}</p>
      </div>
    </div>
  );
}

/** Read-only preview for staff, answer key included. Students have no route to this data. */
export function ActivityPreviewDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isError } = useActivity(id);
  const timeZone = useUserTimeZone();
  const activity: LibraryActivityDto | undefined = data && data.id === id ? data : undefined;
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity?.title ?? "Preview"}</DialogTitle>
          {activity?.description ? <DialogDescription>{activity.description}</DialogDescription> : <DialogDescription className="sr-only">Activity preview</DialogDescription>}
        </DialogHeader>
        {activity ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={difficultyBadgeVariant(activity.difficulty)}>{PUZZLE_DIFFICULTY_LABELS[activity.difficulty]}</Badge>
              <Badge variant="outline">{activity.topicName}</Badge>
              {activity.topic ? <Badge variant="outline">{activity.topic}</Badge> : null}
              {activity.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
            {activity.kind === "MCQ" ? <McqPreview config={activity.config as McqConfig} /> : <PlayoutPreview config={activity.config as PlayoutConfig} />}
            <p className="text-xs text-app-muted">
              Created by {activity.createdByName ?? "an admin"} on {formatFullDate(activity.createdAt, timeZone)} · Updated{" "}
              {formatFullDate(activity.updatedAt, timeZone)}
            </p>
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-app-muted">Couldn&apos;t load this activity.</p>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
