"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/utils";
import { ControlBadge, CONTROL_BUTTON_BASE, CONTROL_BUTTON_VARIANTS } from "./MeetingControlButton";

export interface MoreControlItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** A count shown at the row's end (unread chat, students to move). */
  badge?: number;
  /** Destructive rows (none today) go last and red. */
  tone?: "danger";
}

/**
 * More menu (spec component 8): 200px, items with counts. Holds the secondary
 * controls (settings, fullscreen, mini player, recording) and whichever bar
 * controls don't fit the width. Radix menu: arrow keys, typeahead, Escape.
 * `header` renders above the rows (the reaction tray when Reactions overflowed).
 */
export function MoreControlsMenu({ items, header }: { items: MoreControlItem[]; header?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const badge = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={badge > 0 ? `More controls (${badge})` : "More controls"}
          className={cn(CONTROL_BUTTON_BASE, CONTROL_BUTTON_VARIANTS[open ? "active" : "default"])}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} />
          <ControlBadge count={badge} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-[12.5rem] p-1">
        {header ? (
          <>
            {header}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            onSelect={() => item.onClick()}
            className={cn(
              "min-h-10 gap-2.5 rounded-chip px-2.5 text-sm font-medium",
              item.active && "bg-primary-soft text-primary-ink",
              item.tone === "danger" && "text-app-danger-ink",
            )}
          >
            <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold tabular-nums text-on-primary">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
