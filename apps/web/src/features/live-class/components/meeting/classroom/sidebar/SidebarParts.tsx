"use client";

import { RoomTabs } from "../../../room-ui/RoomTabs";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/** The slim row under a sidebar tab: a search toggle and an optional menu, right-aligned. */
export function SidebarListHeader({
  searchOpen,
  onToggleSearch,
  searchLabel,
  menu,
  children
}: {
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchLabel: string;
  menu?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-app-border/60 px-2">
      <div className="min-w-0 flex-1 truncate text-xs text-app-muted">{children}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        <SimpleTooltip label={searchOpen ? "Close search" : searchLabel}>
          <button
            type="button"
            onClick={onToggleSearch}
            aria-label={searchOpen ? "Close search" : searchLabel}
            aria-pressed={searchOpen}
            className={cn(
              "flex size-7 items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text",
              searchOpen && "bg-app-soft text-app-text"
            )}
          >
            {searchOpen ? <X className="size-4" strokeWidth={2.5} /> : <Search className="size-4" strokeWidth={2.5} />}
          </button>
        </SimpleTooltip>
        {menu}
      </div>
    </div>
  );
}

export function SidebarSearch({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="shrink-0 border-b border-app-border/40 px-2 py-1.5">
      <div className="flex items-center gap-2 rounded-full bg-app-soft px-3 py-1 ring-1 ring-app-border/50 focus-within:ring-primary/40">
        <Search className="size-3.5 shrink-0 text-app-muted" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full bg-transparent text-[0.8125rem] font-medium text-app-text outline-none placeholder:text-app-muted"
        />
      </div>
    </div>
  );
}

export type SidebarTab<T extends string> = { id: T; label: string; count?: number; badge?: number; icon?: ReactNode };

/** Two-tab strip for a sidebar panel; the active tab is a filled blue pill. */
export function SidebarTabs<T extends string>({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: SidebarTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 border-b border-app-border px-2 py-2">
      <RoomTabs
        ariaLabel={label}
        items={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, badge: tab.badge || tab.count }))}
        value={value}
        onChange={onChange}
        maxVisible={3}
      />
    </div>
  );
}
