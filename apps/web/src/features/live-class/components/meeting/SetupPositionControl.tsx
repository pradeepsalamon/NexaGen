"use client";

import { ChessKnight, Keyboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { COACH_BOARD_SHORTCUTS, COACH_BOARD_SHORTCUT_KEY, useCoachBoardActions } from "../../lib/coachBoardShortcuts";
import { MeetingControlButton } from "./MeetingControlButton";

/**
 * Toolbar button for the coach's classroom board: opens the board's own Setup
 * Position dialog, with a corner button for the board shortcut guide. Renders
 * nothing unless that board is on stage (the phone layout and the other stages
 * have no setup dialog to open).
 */
export function SetupPositionControl() {
  const openSetup = useCoachBoardActions((s) => s.openSetup);
  if (!openSetup) return null;

  return (
    <div className="relative">
      <MeetingControlButton
        icon={<ChessKnight className="size-5" />}
        label="Setup position"
        shortcut={COACH_BOARD_SHORTCUT_KEY.setup}
        onClick={openSetup}
      />
      <Popover>
        <PopoverTrigger asChild>
          {/* Already a Radix trigger, so `title` rather than a wrapping tooltip (UI_RULES). */}
          <button
            type="button"
            aria-label="Board keyboard shortcuts"
            title="Board keyboard shortcuts"
            className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-app-border bg-app-surface text-app-muted shadow-card transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Keyboard className="size-3" strokeWidth={2.5} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-56 p-2">
          <p className="px-1.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-app-muted">Board shortcuts</p>
          <dl className="space-y-0.5">
            {COACH_BOARD_SHORTCUTS.map(({ id, key, label }) => (
              <div key={id} className="flex items-center justify-between gap-3 rounded-control px-1.5 py-1">
                <dt className="min-w-0 truncate text-sm text-app-text">{label}</dt>
                <dd>
                  <kbd className="rounded-control border border-app-border bg-app-soft px-2 py-0.5 font-mono text-xs font-semibold text-app-muted">
                    {key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="px-1.5 pt-1.5 text-xs text-app-muted">Off while typing or with a dialog open.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
