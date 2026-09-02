"use client";

import { ChevronDown, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { NavItem } from "@/components/layout/navItems";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * Desktop rail. The layout only ever reserves the collapsed rail's width — the
 * panel itself is `fixed`, so expanding it slides out as an **overlay** above the
 * page content instead of reflowing it. Clicking outside or pressing Escape
 * collapses it back to the rail.
 */
export function SidebarContainer({
  children,
  collapsed,
  onDismiss
}: {
  children: ReactNode;
  collapsed: boolean;
  onDismiss: () => void;
}) {
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (collapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!asideRef.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [collapsed, onDismiss]);

  return (
    <>
      {/* Reserves only the rail's width in the flow; the panel overlays the rest. */}
      <div aria-hidden className="hidden w-[4.75rem] flex-shrink-0 md:block" />
      <aside
        className={cn(
          "fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden border-r border-app-border bg-app-surface transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-[4.75rem]" : "w-60 shadow-soft"
        )}
        data-collapsed={collapsed}
        ref={asideRef}
      >
        <nav className="space-y-1 p-3">{children}</nav>
      </aside>
    </>
  );
}

export function SidebarToggle({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <div className={cn("mb-1 flex", collapsed ? "justify-center" : "justify-end")}>
      <SimpleTooltip label={label} side="right">
        <button
          aria-label={label}
          className="inline-flex size-8 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          onClick={onToggle}
          type="button"
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </button>
      </SimpleTooltip>
    </div>
  );
}

export function SidebarLink({
  active,
  collapsed,
  item
}: {
  active: boolean;
  collapsed: boolean;
  item: NavItem;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-control text-sm font-semibold transition",
        collapsed ? "size-10 justify-center" : "gap-2.5 px-3 py-2",
        active
          ? "bg-secondary text-black shadow-card"
          : "text-app-muted hover:bg-app-soft hover:text-primary"
      )}
      href={item.href}
    >
      <Icon className="size-4 shrink-0" strokeWidth={2.25} />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <SimpleTooltip label={item.label} side="right">
        {link}
      </SimpleTooltip>
    );
  }
  return link;
}

/**
 * Boxed, collapsible nav group for the admin sidebar. Expanded: a filled box
 * header with the group's links nested in an inset panel. Collapsed rail: an
 * icon button that opens the group's links in a flyout popover.
 */
export function SidebarGroupBox({
  collapsed,
  group,
  hasActive,
  icon,
  isItemActive,
  items,
  onToggle,
  open
}: {
  collapsed: boolean;
  group: string;
  hasActive: boolean;
  icon?: LucideIcon;
  isItemActive: (href: string) => boolean;
  items: NavItem[];
  onToggle: () => void;
  open: boolean;
}) {
  const Icon = icon ?? SlidersHorizontal;

  if (collapsed) {
    return (
      <Popover>
        <SimpleTooltip label={group} side="right">
          <PopoverTrigger asChild>
            <button
              aria-label={group}
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-control transition",
                hasActive
                  ? "bg-primary/10 text-primary"
                  : "text-app-muted hover:bg-app-soft hover:text-primary"
              )}
              type="button"
            >
              <Icon className="size-4" strokeWidth={2.25} />
            </button>
          </PopoverTrigger>
        </SimpleTooltip>
        <PopoverContent align="start" className="w-56 p-1.5" side="right">
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-app-muted">
            {group}
          </p>
          <div className="space-y-0.5">
            {items.map((item) => (
              <SidebarLink
                active={isItemActive(item.href)}
                collapsed={false}
                item={item}
                key={item.href}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div>
      <button
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-panel border px-3 py-2.5 text-sm font-bold transition",
          open || hasActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-app-border bg-app-soft text-app-text hover:border-primary/30 hover:text-primary"
        )}
        onClick={onToggle}
        type="button"
      >
        <span
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-control transition",
            open || hasActive ? "bg-primary/15 text-primary" : "bg-app-surface text-app-muted"
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.5} />
        </span>
        <span className="flex-1 truncate text-left">{group}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 transition-transform", open ? "" : "-rotate-90")}
          strokeWidth={2.5}
        />
      </button>
      {open ? (
        <div className="mb-1.5 mt-1 space-y-0.5 rounded-panel border border-app-border bg-app-background/50 p-1.5">
          {items.map((item) => (
            <SidebarLink
              active={isItemActive(item.href)}
              collapsed={false}
              item={item}
              key={item.href}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
