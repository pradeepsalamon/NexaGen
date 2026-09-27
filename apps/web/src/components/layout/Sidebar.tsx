"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import type { NavItem } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn } from "@/lib/utils";

/** Signed-in user pinned to the drawer's foot; links to their profile. */
function NavDrawerUser() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    user.email.slice(0, 1).toUpperCase();

  return (
    <Link
      className="flex items-center gap-3 rounded-[14px] bg-white/[0.08] p-2 text-white transition-colors duration-150 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      href="/profile"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15 text-sm font-bold">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-white/60">{user.email}</span>
      </span>
    </Link>
  );
}

// Gap between the card and the screen edge, and how much of it slides out on an edge hover.
const EDGE_GAP_PX = 12;
const PEEK_PX = 28;
// A pull that reveals this share of the card opens it; less snaps back.
const PULL_OPEN_RATIO = 0.35;

/**
 * Off-canvas role nav: a floating card that slides in over the page (and
 * header). Fully hidden when closed except for its tab handle; a mouse at the
 * left screen edge makes a piece of it peek out, and the handle or peeked
 * piece can be dragged out to open it. Escape, the backdrop, a link click or
 * any route change closes it.
 */
export function NavDrawer({
  children,
  footer,
  subtitle,
  title
}: {
  children: ReactNode;
  /** Replaces the default signed-in-user card at the foot. */
  footer?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  const pathname = usePathname();
  const open = useSidebarStore((state) => state.open);
  const close = useSidebarStore((state) => state.close);
  const show = useSidebarStore((state) => state.show);
  const toggle = useSidebarStore((state) => state.toggle);
  const setAvailable = useSidebarStore((state) => state.setAvailable);
  const panelRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState(false);
  // Pixels the card has been pulled out from fully hidden; null when not dragging.
  const [pullOffset, setPullOffset] = useState<number | null>(null);
  const pull = useRef<{ base: number; moved: boolean; offset: number; startX: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    setAvailable(true);
    return () => setAvailable(false);
  }, [setAvailable]);

  useEffect(() => {
    close();
  }, [close, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  // React 18 has no `inert` prop; keeps the hidden panel out of the tab order.
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", !open);
    if (open) setPeek(false);
  }, [open]);

  const maxPull = () => (wrapperRef.current?.offsetWidth ?? 280) + EDGE_GAP_PX;

  const onPullStart = (event: PointerEvent<HTMLElement>) => {
    if (open || (event.pointerType === "mouse" && event.button !== 0)) return;
    const base = peek ? PEEK_PX : 0;
    pull.current = { base, moved: false, offset: base, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPullMove = (event: PointerEvent<HTMLElement>) => {
    const state = pull.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < 6) return;
    state.moved = true;
    state.offset = Math.min(maxPull(), Math.max(0, state.base + dx));
    setPullOffset(state.offset);
  };

  const onPullEnd = () => {
    const state = pull.current;
    pull.current = null;
    if (!state) return;
    if (state.moved) {
      // The pointerup of a drag also fires a click; that click must not toggle again.
      suppressClick.current = true;
      if (state.offset > maxPull() * PULL_OPEN_RATIO) show();
    }
    setPullOffset(null);
  };

  const pullHandlers = {
    onPointerCancel: onPullEnd,
    onPointerDown: onPullStart,
    onPointerMove: onPullMove,
    onPointerUp: onPullEnd
  };

  const unlessDragged = (action: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  };

  return (
    <>
      {/* Mounted only while open — a permanent full-screen layer costs every page scroll. */}
      {open ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-[45] animate-overlay-in cursor-default bg-black/40"
          onClick={close}
          type="button"
        />
      ) : null}

      {/* Mouse-only hot zone on the screen edge: hovering it slides a piece of the card out. */}
      {!open ? (
        <div
          aria-hidden="true"
          className="fixed inset-y-0 left-0 z-[49] hidden w-2 [@media(hover:hover)]:block"
          onPointerEnter={() => setPeek(true)}
        />
      ) : null}

      <div
        className={cn(
          "fixed bottom-3 left-3 top-3 z-50 w-[280px] max-w-[calc(100vw-48px)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] max-md:w-[240px]",
          open
            ? "translate-x-0"
            : peek
              ? "-translate-x-[calc(100%-16px)]"
              : "-translate-x-[calc(100%+12px)]"
        )}
        onPointerLeave={() => {
          if (!pull.current) setPeek(false);
        }}
        ref={wrapperRef}
        style={
          pullOffset === null
            ? undefined
            : {
                transform: `translateX(calc(-100% - ${EDGE_GAP_PX}px + ${pullOffset}px))`,
                transition: "none"
              }
        }
      >
        <aside
          aria-label={`${title} navigation`}
          className="flex h-full flex-col overflow-hidden rounded-[24px] bg-primary shadow-lift dark:border dark:border-app-border dark:bg-app-surface"
          ref={panelRef}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <Logo compact onDark size={34} />
            {subtitle ? (
              <span className="min-w-0 truncate rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/85">
                {subtitle}
              </span>
            ) : null}
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain bg-primary px-[14px] py-4 [contain:content] [scrollbar-width:none] [will-change:transform] dark:bg-app-surface [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            {children}
          </nav>

          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 p-[14px]">
            {footer ?? <NavDrawerUser />}
          </div>
        </aside>

        {/* The visible slice of a closed card: click to open, or drag it out. */}
        {!open ? (
          <button
            aria-hidden="true"
            className="group absolute inset-y-0 right-0 flex w-10 cursor-grab touch-none items-center justify-end pr-2 active:cursor-grabbing"
            onClick={unlessDragged(show)}
            tabIndex={-1}
            type="button"
            {...pullHandlers}
          >
            <span
              className={cn(
                "h-12 w-1 rounded-full bg-white/50 transition-opacity duration-200",
                peek || pullOffset !== null ? "opacity-100" : "opacity-0"
              )}
            />
          </button>
        ) : null}

        {/* Tab handle riding the card's edge — the only part visible while closed. */}
        <button
          aria-expanded={open}
          aria-label={open ? "Close sidebar" : "Open sidebar"}
          className={cn(
            "absolute left-full top-1/2 flex h-14 -translate-y-1/2 items-center justify-center bg-secondary text-black shadow-lift transition-[width,margin,border-radius] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
            open ? "ml-2 w-7 rounded-app" : "w-5 touch-none rounded-r-app hover:w-6"
          )}
          onClick={unlessDragged(toggle)}
          type="button"
          {...(open ? {} : pullHandlers)}
        >
          <ChevronLeft
            aria-hidden="true"
            className={cn("size-3.5 transition-transform duration-300", open ? "" : "rotate-180")}
            strokeWidth={2.75}
          />
        </button>
      </div>
    </>
  );
}

const BADGE_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-accent text-accent-ink",
  danger: "bg-app-danger text-white",
  primary: "bg-white text-primary",
  secondary: "bg-secondary text-black",
  warm: "bg-warm text-warm-ink"
};

const DOT_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-accent",
  danger: "bg-app-danger",
  primary: "bg-white",
  secondary: "bg-secondary",
  warm: "bg-warm"
};

/** Trailing chip/dot on a nav link, solid so it reads on the drawer's filled background. */
function NavBadge({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  if (badge.variant === "dot" || !badge.label) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full ring-1 ring-black/10",
          DOT_TONE[badge.tone],
          badge.pulse && "motion-safe:animate-pulse"
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-[6.5rem] shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-black/10",
        BADGE_TONE[badge.tone],
        badge.pulse && "motion-safe:animate-pulse"
      )}
    >
      <span className="truncate">{badge.label}</span>
    </span>
  );
}

const ROW_BASE =
  "flex h-10 w-full items-center gap-1.5 rounded-[10px] px-2.5 text-base font-semibold leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";
// Current page: solid emerald (accent), same as the current child inside a section.
const ROW_ACTIVE = "bg-accent text-white shadow-[0_4px_12px_-4px_rgb(var(--rgb-accent)/0.6)]";
// Expanded section: emerald tint with a left rule — open, but not the current page.
const ROW_OPEN =
  "bg-accent/20 text-[color-mix(in_srgb,var(--color-accent)_45%,white)] shadow-[inset_3px_0_0_rgb(var(--rgb-accent))] hover:bg-accent/25";
const ROW_IDLE = "bg-white/[0.04] text-white hover:bg-white/[0.08]";

/** Top-level direct link. */
export function NavDrawerLink({ active, item }: { active: boolean; item: NavItem }) {
  const Icon = item.icon;
  const close = useSidebarStore((state) => state.close);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE)}
      href={item.href}
      onClick={close}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        <Icon aria-hidden="true" className="size-[18px]" strokeWidth={2.25} />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? <NavBadge badge={item.badge} /> : null}
    </Link>
  );
}

/** Collapsible section; its header turns active while expanded, children sit in an inset panel. */
export function NavDrawerAccordion({
  icon: Icon,
  id,
  isItemActive,
  items,
  label,
  onToggle,
  open
}: {
  icon: LucideIcon;
  id: string;
  isItemActive: (href: string) => boolean;
  items: NavItem[];
  label: string;
  onToggle: () => void;
  open: boolean;
}) {
  const close = useSidebarStore((state) => state.close);
  const panelId = `sidebar-submenu-${id}`;

  return (
    <div className="flex flex-col">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(ROW_BASE, "text-left", open ? ROW_OPEN : ROW_IDLE)}
        onClick={onToggle}
        type="button"
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={2.25} />
        </span>
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 transition-transform duration-300", open && "rotate-180")}
          strokeWidth={2.25}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-in-out",
          open ? "max-h-[800px] pt-1.5 opacity-100" : "max-h-0 opacity-0"
        )}
        id={panelId}
      >
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-white/[0.08] p-2.5 shadow-[0px_1px_2px_rgba(14,15,17,0.06)]">
          {items.map((item) => {
            const ItemIcon = item.icon;
            const active = isItemActive(item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                  active
                    ? cn("font-semibold", ROW_ACTIVE)
                    : "bg-white/[0.14] font-medium text-white hover:bg-white/20"
                )}
                href={item.href}
                key={item.href}
                onClick={close}
                tabIndex={open ? undefined : -1}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <ItemIcon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? <NavBadge badge={item.badge} /> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
