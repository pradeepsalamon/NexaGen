"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export interface MoreControlItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Only listed below `sm`, where the toolbar has no room for its own button. */
  mobileOnly?: boolean;
}

/**
 * Overflow menu for the meeting toolbar — holds the secondary controls that
 * don't need to be one tap away (settings, fullscreen, raise hand, and on
 * small screens the media controls that don't fit a single row). The heavy
 * LiveKit hooks stay in `MeetingToolbar`; this only renders rows.
 */
export function MoreControlsMenu({ items }: { items: MoreControlItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More controls"
          className={cn(
            "relative flex size-11 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-muted transition-all duration-150 ease-out hover:bg-app-soft hover:text-app-text active:scale-95 motion-reduce:active:scale-100 sm:size-12",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            open && "bg-primary text-white",
          )}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={12} className="w-56 p-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-app-text transition-colors hover:bg-app-soft disabled:opacity-60",
              item.active && "bg-primary/10 text-primary",
              item.mobileOnly && "sm:hidden",
            )}
            onClick={() => {
              item.onClick();
              setOpen(false);
            }}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
