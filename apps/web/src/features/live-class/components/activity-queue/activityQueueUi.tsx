import { BookOpen, Check, CircleCheck, Clock, ListChecks, Loader2, Minus, MessageCircleQuestion, Puzzle, Swords, X } from "lucide-react";
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_RESPONSE_LABELS,
  type ActivityKind,
  type ActivityQueueStatus,
  type ActivityResponseState
} from "@nexa-chess/types";
import { cn } from "@/lib/utils";

export function ActivityKindIcon({ kind, className }: { kind: ActivityKind; className?: string }) {
  const Icon = { CHAPTER: BookOpen, MCQ: ListChecks, PLAYOUT: Swords, PUZZLE: Puzzle, QUESTION: MessageCircleQuestion }[kind];
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

export function activityKindLabel(kind: ActivityKind) {
  return ACTIVITY_KIND_LABELS[kind];
}

export const QUEUE_STATUS_BADGE: Record<
  ActivityQueueStatus,
  { label: string; variant: "secondary" | "success" | "info" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  FINISHED: { label: "Finished", variant: "info" },
  LIVE: { label: "Live", variant: "success" }
};

const RESPONSE_STYLE: Record<ActivityResponseState, { icon: typeof Check; className: string; spin?: boolean }> = {
  CORRECT: { className: "bg-success/15 text-success-ink", icon: Check },
  INCORRECT: { className: "bg-app-danger/15 text-app-danger-ink", icon: X },
  IN_PROGRESS: { className: "bg-warning/15 text-warning-ink", icon: Loader2, spin: true },
  MISSED: { className: "bg-app-soft text-app-muted", icon: Minus },
  PENDING: { className: "bg-app-soft text-app-muted", icon: Clock },
  SUBMITTED: { className: "bg-info/15 text-info-ink", icon: CircleCheck }
};

/** One status chip of the progress grid: an icon whose meaning is also spoken. */
export function ResponseStateIcon({ state }: { state: ActivityResponseState }) {
  const style = RESPONSE_STYLE[state];
  const Icon = style.icon;
  return (
    <span className={cn("inline-flex size-6 items-center justify-center rounded-full", style.className)}>
      <Icon className={cn("size-3.5", style.spin && "animate-spin [animation-duration:2.5s]")} strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{ACTIVITY_RESPONSE_LABELS[state]}</span>
    </span>
  );
}

/** The legend under the grid, so the icons never have to be guessed. */
export function ResponseLegend() {
  const order: ActivityResponseState[] = ["CORRECT", "INCORRECT", "SUBMITTED", "IN_PROGRESS", "PENDING", "MISSED"];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-app-muted" aria-label="What the icons mean">
      {order.map((state) => (
        <li key={state} className="flex items-center gap-1">
          <span aria-hidden="true" className="scale-75">
            <ResponseStateIcon state={state} />
          </span>
          {ACTIVITY_RESPONSE_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}
