"use client";

import { ArrowDownUp } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { cn } from "@/lib/utils";

/** Flips only this viewer's board — nothing is broadcast to the coach or other students. */
export function FlipBoardButton({ className }: { className?: string }) {
  const localFlip = useBoardStore((s) => s.localFlip);
  const toggleLocalFlip = useBoardStore((s) => s.toggleLocalFlip);
  const label = localFlip ? "Restore board orientation" : "Flip board (only for you)";

  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={localFlip}
        onClick={toggleLocalFlip}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border border-app-border bg-app-surface/80 text-app-text shadow-sm backdrop-blur-sm transition-all duration-150 hover:scale-105 hover:bg-app-surface",
          localFlip && "border-primary text-primary",
          className,
        )}
      >
        <ArrowDownUp className="size-3.5" strokeWidth={2.5} />
      </button>
    </SimpleTooltip>
  );
}
