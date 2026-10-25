"use client";

import { useEffect } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { matchCoachBoardShortcut } from "@/features/live-class/lib/coachBoardShortcuts";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";
import { controlSideForIdentity } from "../../lib/boardSyncRules";

/**
 * Coach only: "Allow Illegal Moves" on the main board. While on, any piece
 * goes to any square — out of turn, through pieces, leaving a king in check —
 * and the resulting position syncs to the class as usual. In a live class it
 * reaches the students with the board permissions, so a student holding
 * control moves their colour(s) freely too. Off on every page load; turning
 * it off goes straight back to legal moves. The I key toggles it while the
 * toggle is on screen (coach boards only).
 */
export function IllegalMovesToggle({ className }: { className?: string }) {
  const allow = useBoardStore((s) => s.allowIllegalMoves);
  const setAllow = useBoardStore((s) => s.setAllowIllegalMoves);
  const isSetupOpen = useBoardStore((s) => s.isSetupPositionOpen);

  useEffect(() => {
    // The set-up board hides the main one; nothing toggles behind it.
    if (isSetupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchCoachBoardShortcut(e) !== "illegalMoves") return;
      e.preventDefault();
      setAllow(!allow);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allow, setAllow, isSetupOpen]);

  return (
    <SimpleTooltip
      label={
        allow
          ? "Illegal moves are on: drag any piece to any square — students with board control can too. Undo steps back across them. (I)"
          : "Let pieces move anywhere, ignoring chess rules (I)"
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

/**
 * Student side of the live board: tells a student holding control that the
 * coach turned on "Allow Illegal Moves". Renders nothing otherwise.
 */
export function IllegalMovesBadge({ className }: { className?: string }) {
  const { localParticipant } = useLocalParticipant();
  const side = useBoardStore((s) =>
    s.allowIllegalMoves && !s.isDetached
      ? controlSideForIdentity({
          identity: localParticipant?.identity,
          permissionMode: s.permissionMode,
          selectedStudentIds: s.selectedStudentIds,
          selectedStudentSides: s.selectedStudentSides,
        })
      : null,
  );
  if (!side) return null;
  const pieces = side === "both" ? "any piece" : `any ${side} piece`;

  return (
    <SimpleTooltip label={`The coach allowed illegal moves: drag ${pieces} to any square, whoever's turn it is.`}>
      <span
        data-testid="illegal-moves-badge"
        tabIndex={0}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full border border-warning/50 bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-ink",
          className,
        )}
      >
        <TriangleAlert className="size-3.5" strokeWidth={2.5} />
        Illegal moves on
      </span>
    </SimpleTooltip>
  );
}
