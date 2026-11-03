"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export interface RoomTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** A count (unread, waiting, to move). */
  badge?: number;
  /** Something new happened here (a new activity), without a count. */
  dot?: boolean;
}

/** Selected = blue chip; unselected = muted text on the sunken track. */
const CHIP =
  "relative inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 text-[0.8125rem] font-medium leading-none transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-focus";

function Marker({ item, selected }: { item: RoomTabItem; selected: boolean }) {
  if (item.badge && item.badge > 0) {
    return (
      <span
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums leading-none",
          selected ? "bg-on-primary/20 text-on-primary" : "bg-primary text-on-primary",
        )}
      >
        {item.badge > 99 ? "99+" : item.badge}
      </span>
    );
  }
  if (item.dot) {
    return (
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", selected ? "bg-on-primary" : "bg-primary")}
      />
    );
  }
  return null;
}

function spoken(item: RoomTabItem) {
  if (item.badge && item.badge > 0) return `${item.label} (${item.badge})`;
  if (item.dot) return `${item.label} (new)`;
  return item.label;
}

/**
 * Stage switch and panel tabs (spec component 7): a 36px sunken track with
 * 28px chips, icon + label, a count or a dot. At most `maxVisible` items show
 * — four stage views, three panel tabs — and the rest go under a "More" chip.
 * The selected item always stays visible (it takes the last visible slot).
 */
export function RoomTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  maxVisible = 4,
  iconOnly = false,
  fill = false,
  className,
}: {
  items: RoomTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  maxVisible?: number;
  /** Unselected chips show only their icon (with a tooltip); the selected one keeps its label. */
  iconOnly?: boolean;
  /** Phones: a 44px full-width track whose chips share the width (spec: phone stage switch). */
  fill?: boolean;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slots = Math.max(1, Math.min(items.length, maxVisible));
  let visible = items.slice(0, slots);
  const selected = items.find((item) => item.id === value);
  if (selected && !visible.includes(selected)) visible = [...visible.slice(0, slots - 1), selected];
  const hidden = items.filter((item) => !visible.includes(item));
  const hiddenMarked = hidden.some((item) => (item.badge ?? 0) > 0 || item.dot);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = Array.from(trackRef.current?.querySelectorAll<HTMLButtonElement>("[data-room-tab]") ?? []);
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    // Stops the board's arrow-key navigation from also firing.
    event.stopPropagation();
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    next?.focus();
  };

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex h-9 max-w-full shrink-0 items-center gap-0.5 rounded-control bg-app-soft p-1",
        fill && "flex h-11 w-full",
        className,
      )}
    >
      {visible.map((item) => {
        const isSelected = item.id === value;
        const showLabel = !iconOnly || isSelected || !item.icon;
        const chip = (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-room-tab
            aria-selected={isSelected}
            aria-label={spoken(item)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              CHIP,
              fill && "h-9 flex-1 justify-center",
              isSelected
                ? "bg-primary text-on-primary shadow-card"
                : "text-app-muted hover:bg-app-surface hover:text-app-text",
            )}
          >
            {item.icon}
            {showLabel ? <span>{item.label}</span> : null}
            <Marker item={item} selected={isSelected} />
          </button>
        );
        return showLabel ? (
          chip
        ) : (
          <SimpleTooltip key={item.id} label={item.label}>
            {chip}
          </SimpleTooltip>
        );
      })}
      {hidden.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-room-tab
              tabIndex={-1}
              aria-label={hiddenMarked ? "More views (new)" : "More views"}
              className={cn(CHIP, "text-app-muted hover:bg-app-surface hover:text-app-text")}
            >
              More
              {hiddenMarked ? <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" /> : null}
              <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[12.5rem]">
            {hidden.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onChange(item.id)} className="gap-2">
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <Marker item={item} selected={false} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
