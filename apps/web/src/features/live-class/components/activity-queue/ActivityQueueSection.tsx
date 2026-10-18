"use client";

import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { ActivityQueueManager } from "./ActivityQueueManager";

/**
 * The class page's "Activity queue" card: draft the lesson's sequence before
 * the class starts. Launching and running it happen in the live room's Queue
 * tab (the launch button here only works once the class is live).
 */
export function ActivityQueueSection({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-5 text-left sm:p-6"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ListChecks className="size-5 shrink-0 text-primary-ink" strokeWidth={2.5} />
          <span className="min-w-0">
            <span className="block text-lg font-bold text-app-text">Activity queue</span>
            <span className="block text-sm text-app-muted">
              Line up puzzles for the lesson and run them with the class in order.
            </span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-app-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-app-border p-5 sm:p-6">
          <ActivityQueueManager classId={classId} />
        </div>
      ) : null}
    </Card>
  );
}
