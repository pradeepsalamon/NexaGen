"use client";

import { useState } from "react";
import { Circle, MoreHorizontal, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

interface MoreControlsMenuProps {
  isCoach: boolean;
  settingsActive: boolean;
  onOpenSettings: () => void;
  isRecording: boolean;
  isTogglingRecording: boolean;
  onToggleRecording: () => void;
}

/**
 * Mobile-only overflow menu for the meeting toolbar. Holds the controls that
 * don't fit a one-row phone toolbar (Settings, and — for coaches — Record).
 * The heavy LiveKit hooks stay in `MeetingToolbar`; this component only renders
 * rows and forwards clicks.
 */
export function MoreControlsMenu({
  isCoach,
  settingsActive,
  onOpenSettings,
  isRecording,
  isTogglingRecording,
  onToggleRecording,
}: MoreControlsMenuProps) {
  const [open, setOpen] = useState(false);

  const rowClass =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-app-text transition-colors hover:bg-app-soft";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More controls"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-muted transition-all duration-150 ease-out hover:bg-app-soft hover:text-app-text active:scale-95 min-[360px]:size-11 sm:size-12",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            open && "bg-primary text-white",
          )}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-56 p-1.5"
      >
        <button
          type="button"
          className={cn(rowClass, settingsActive && "bg-primary/10 text-primary")}
          onClick={() => {
            onOpenSettings();
            setOpen(false);
          }}
        >
          <Settings className="size-5 shrink-0" />
          Settings
        </button>

        {isCoach && (
          <button
            type="button"
            disabled={isTogglingRecording}
            className={cn(rowClass, "disabled:opacity-60")}
            onClick={() => {
              onToggleRecording();
              setOpen(false);
            }}
          >
            <Circle
              className={cn(
                "size-5 shrink-0",
                isRecording && "fill-red-500 text-red-500",
              )}
            />
            {isTogglingRecording
              ? "Updating recording…"
              : isRecording
                ? "Stop recording"
                : "Record class"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
