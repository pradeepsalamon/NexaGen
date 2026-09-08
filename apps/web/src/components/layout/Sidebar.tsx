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
  footer,
  onDismiss
}: {
  children: ReactNode;
  collapsed: boolean;
  /** Pinned below the scrolling nav; hidden on the collapsed rail. */
  footer?: ReactNode;
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
          "fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] flex-col overflow-x-hidden border-r border-app-border bg-app-surface transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[4.75rem]" : "w-60 shadow-soft"
        )}
        data-collapsed={collapsed}
        ref={asideRef}
      >
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">{children}</nav>
        {footer && !collapsed ? (
          <div className="shrink-0 space-y-3 border-t border-app-border p-3">{footer}</div>
        ) : null}
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

const BADGE_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "border-accent/50 bg-accent/20 text-accent-ink",
  danger: "border-app-danger/25 bg-app-danger/10 text-app-danger",
  primary: "border-app-border bg-app-soft text-primary",
  secondary: "border-secondary/40 bg-secondary/20 text-secondary-ink",
  warm: "border-warm/50 bg-warm/25 text-warm-ink"
};

const DOT_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-accent",
  danger: "bg-app-danger",
  primary: "bg-primary",
  secondary: "bg-secondary",
  warm: "bg-warm"
};

/** Trailing chip/dot on a nav link. On the collapsed rail it shrinks to a dot. */
function SidebarBadge({
  badge,
  collapsed
}: {
  badge: NonNullable<NavItem["badge"]>;
  collapsed: boolean;
}) {
  if (collapsed || badge.variant === "dot" || !badge.label) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          DOT_TONE[badge.tone],
          collapsed && "absolute right-1 top-1",
          badge.pulse && "motion-safe:animate-pulse"
        )}
      />
    );
  }

  return (
    // Capped and truncating: a real batch name is far longer than a mock's
    // "Batch A" and would otherwise squeeze the link's own label away.
    <span
      className={cn(
        "inline-flex max-w-[6.5rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
        BADGE_TONE[badge.tone]
      )}
    >
      {badge.pulse ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full motion-safe:animate-pulse",
            DOT_TONE[badge.tone]
          )}
        />
      ) : null}
      <span className="truncate">{badge.label}</span>
    </span>
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
        "relative flex items-center rounded-control text-sm font-semibold transition",
        collapsed ? "size-10 justify-center" : "justify-between gap-2.5 px-3 py-2",
        active
          ? "bg-secondary text-black shadow-card"
          : "text-app-muted hover:bg-app-soft hover:text-primary"
      )}
      href={item.href}
    >
      <span
        className={cn("flex min-w-0 items-center", collapsed ? "" : "gap-2.5")}
      >
        <Icon className="size-4 shrink-0" strokeWidth={2.25} />
        {collapsed ? null : <span className="truncate">{item.label}</span>}
      </span>
      {item.badge ? <SidebarBadge badge={item.badge} collapsed={collapsed} /> : null}
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
