"use client";

import { useParams } from "next/navigation";
import { Check, ListOrdered } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useActivityQueueSync, useCurrentActivityQueue } from "../../hooks/useActivityQueue";
import { ActivityKindIcon, activityKindLabel } from "./activityQueueUi";

/**
 * Top-bar pill while the coach runs an activity queue: "2 / 5", opening to the
 * queue's name, the current activity and — for a student — which activities
 * they have answered. Nothing about upcoming items or anyone else. The
 * activities themselves still arrive through the puzzle solver / question
 * dialog. Must render inside `<LiveKitRoom>`.
 */
export function ActivityQueueStatusPill() {
  const classId = (useParams()?.roomId as string | undefined) ?? "";
  const role = useAuthStore((s) => s.user?.role);
  const isStudent = role === "STUDENT";
  useActivityQueueSync(classId, { isManager: !isStudent });
  const { data } = useCurrentActivityQueue(classId);
  const queue = data?.queue;
  if (!queue || !queue.current) return null;

  const answered = queue.mine.filter((m) => m.responded).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${queue.title}: activity ${queue.currentNumber} of ${queue.total}. Show details`}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary-ink transition-colors hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
        >
          <ListOrdered className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          <span className="tabular-nums">
            {queue.currentNumber}/{queue.total}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div>
          <p className="text-xs font-semibold text-app-muted">Class activities</p>
          <p className="truncate font-semibold text-app-text">{queue.title}</p>
        </div>
        <div className="flex items-center gap-2 rounded-app bg-primary/10 px-2.5 py-2 text-sm text-primary-ink">
          <ActivityKindIcon kind={queue.current.kind} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">Now:</span> {queue.current.title}
          </span>
        </div>
        <p className="text-xs text-app-muted">
          Activity {queue.currentNumber} of {queue.total}. Your coach moves the class on together.
        </p>
        {isStudent && queue.mine.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-app-text">
              You&apos;ve answered {answered} of {queue.mine.length}
            </p>
            <ol className="flex flex-wrap gap-1.5" aria-label="Your answers so far">
              {queue.mine.map((m) => (
                <li
                  key={m.number}
                  aria-label={`${activityKindLabel(m.kind)} ${m.number}: ${m.responded ? "answered" : "not answered"}`}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-xs font-bold",
                    m.responded ? "bg-success/15 text-success-ink" : "bg-app-soft text-app-muted"
                  )}
                >
                  {m.responded ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
                  {m.number}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
