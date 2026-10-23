"use client";

import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";

/**
 * Coach only: "Allow Illegal Moves" on the main board. While on, any piece
 * goes to any square — out of turn, through pieces, leaving a king in check —
 * and the resulting position syncs to the class as usual. Local to this
 * coach's board and off on every page load; turning it off goes straight
 * back to legal moves.
 */
export function IllegalMovesToggle({ className }: { className?: string }) {
  const allow = useBoardStore((s) => s.allowIllegalMoves);
  const setAllow = useBoardStore((s) => s.setAllowIllegalMoves);

  return (
    <SimpleTooltip
      label={
        allow
          ? "Illegal moves are on: drag any piece to any square. Undo steps back across them."
          : "Let pieces move anywhere, ignoring chess rules"
      }
    >
      <label
        data-testid="illegal-moves-toggle"
        data-state={allow ? "on" : "off"}
        className={cn(
          "flex shrink-0 cursor-pointer items-center gap-2 rounded-full border py-0.5 pl-1 pr-2.5 text-xs font-semibold transition-colors",
          allow
            ? "border-warning/50 bg-warning/15 text-warning-ink"
            : "border-app-border bg-app-surface/80 text-app-muted hover:text-app-text",
          className,
        )}
      >
        <Switch
          checked={allow}
          onCheckedChange={setAllow}
          aria-label="Allow Illegal Moves"
          className="h-5 w-9 [&>span]:size-[14px] data-[state=checked]:[&>span]:translate-x-[18px]"
        />
        <span>Allow Illegal Moves</span>
      </label>
    </SimpleTooltip>
  );
}
