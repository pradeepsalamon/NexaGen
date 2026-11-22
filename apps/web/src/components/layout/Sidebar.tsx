"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode
} from "react";
import { Logo } from "@/components/Logo";
import type { NavItem } from "@/components/layout/navItems";
import { Avatar } from "@/components/ui/Avatar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn, enumLabel } from "@/lib/utils";

/** From here the nav is docked beside the page instead of an off-canvas drawer. */
export const NAV_DOCKED_QUERY = "(min-width: 1280px)";

/** True while the nav is the icon rail (from `xl`, panel not out): labels become tooltips. */
const NavRailContext = createContext(false);

/**
 * How the docked nav is moving between rail and panel. Icons never move: every row keeps its icon
 * at the rail's spot, and the panel only widens over them.
 * - `folded`: the target state, at once: pills narrow to the icon and labels fade.
 * - `NavRailContext` (rail view): swaps rows to their rail form (tooltips, flyouts) only once the
 *   panel has finished narrowing, so nothing jumps while it shrinks.
 * - `sectionsOpen`: an open section unfolds only after the panel has widened, and folds first
 *   when it narrows, so the icons below it slide instead of jumping.
 */
const NavMotionContext = createContext({ folded: false, sectionsOpen: true });

/** Width and fade of the docked nav (ms); the rail view swaps in once it is done. */
const NAV_MOTION_MS = 220;

/** Closes whatever nav is out (the drawer below `xl`, the expanded panel from it): a link was chosen. */
function useNavDone() {
  const close = useSidebarStore((state) => state.close);
  const setExpanded = useSidebarStore((state) => state.setExpanded);
  return () => {
    close();
    setExpanded(false);
  };
}

/** In the rail a label is only a tooltip; elsewhere the label is on screen. */
function RailTooltip({ children, label }: { children: ReactElement; label: string }) {
  const rail = useContext(NavRailContext);
  return rail ? (
    <SimpleTooltip label={label} side="right">
      {children}
    </SimpleTooltip>
  ) : (
    children
  );
}

/** Signed-in user pinned to the drawer's foot; links to their profile. */
function NavDrawerUser() {
  const user = useAuthStore((state) => state.user);
  const { folded } = useContext(NavMotionContext);

  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <RailTooltip label={name}>
    <Link
      className={cn(
        "flex h-12 items-center gap-3 overflow-hidden rounded-control px-1 text-on-brand hover:bg-brand-800 motion-safe:transition-[width,background-color] motion-safe:duration-200 motion-safe:ease-out",
        folded ? "w-10" : "w-full"
      )}
      href="/profile"
    >
      <Avatar className="font-bold" imageUrl={user.avatarUrl} name={name} size="sm" />
      <span
        className={cn(
          "min-w-0 flex-1 whitespace-nowrap transition-opacity duration-150",
          folded ? "opacity-0" : "opacity-100 delay-75"
        )}
      >
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-on-brand-muted">
          {enumLabel(user.role)}
        </span>
      </span>
    </Link>
    </RailTooltip>
  );
}

const EDGE_GAP_PX = 12;
const PULL_OPEN_RATIO = 0.35;

export function NavDrawer({
  children,
  footer,
  subtitle,
  title
}: {
  children: ReactNode;
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
  const expanded = useSidebarStore((state) => state.expanded);
  const setExpanded = useSidebarStore((state) => state.setExpanded);
  const toggleExpanded = useSidebarStore((state) => state.toggleExpanded);
  const docked = useMediaQuery(NAV_DOCKED_QUERY);
  const rail = docked && !expanded;
  // See NavMotionContext: the rail view lags a narrowing panel, open sections lag a widening one.
  const [railView, setRailView] = useState(rail);
  const [sectionsOpen, setSectionsOpen] = useState(!rail);
  useEffect(() => {
    if (rail) {
      setSectionsOpen(false);
      const timer = window.setTimeout(() => setRailView(true), NAV_MOTION_MS);
      return () => window.clearTimeout(timer);
    }
    setRailView(false);
    const timer = window.setTimeout(() => setSectionsOpen(true), NAV_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [rail]);

  const panelRef = useRef<HTMLElement>(null);
  const dockedRef = useRef<HTMLDivElement>(null);
  const expandToggleRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pull = useRef<{
    base: number;
    moved: boolean;
    offset: number;
    startX: number;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    setAvailable(true);
    return () => {
      setAvailable(false);
      setExpanded(false);
    };
  }, [setAvailable, setExpanded]);

  // `data-nav` sets `--app-rail-w` (globals.css), the rail's fixed page offset from `xl`.
  // The root layout's init script sets it before paint; this keeps it while a nav is mounted.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nav = "rail";
    return () => {
      delete root.dataset.nav;
    };
  }, []);

  // Widening past `xl` docks the nav: an open drawer or a peek has no meaning there.
  // Narrowing below it leaves no rail for the expanded panel to come back to.
  useEffect(() => {
    if (!docked) {
      setExpanded(false);
      return;
    }
    close();
    setPeek(false);
  }, [close, docked, setExpanded]);

  // Any navigation (a link, back/forward, a redirect) puts the nav away: the rail is the resting state.
  useEffect(() => {
    close();
    setExpanded(false);
  }, [close, pathname, setExpanded]);

  // The expanded panel floats like a popover: Escape or a press outside it (and outside the
  // header, whose controls work alongside it) puts it away.
  useEffect(() => {
    if (!docked || !expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setExpanded(false);
      expandToggleRef.current?.focus();
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dockedRef.current?.contains(target) || target.closest("header")) return;
      setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [docked, expanded, setExpanded]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", !docked && !open && !peek);
    if (open) setPeek(false);
  }, [docked, open, peek]);

  // A peek ends once the pointer is past the drawer, even if it never entered
  // it (then the drawer's pointerleave never fires and it would stay out).
  useEffect(() => {
    if (!peek || open) return;
    const onPointerMove = (event: globalThis.PointerEvent) => {
      // Layout box, not getBoundingClientRect: mid-slide the transform would
      // put the edge short of where the drawer ends up.
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const right = wrapper.offsetLeft + wrapper.offsetWidth;
      if (!pull.current && event.clientX > right + EDGE_GAP_PX) setPeek(false);
    };
    document.addEventListener("pointermove", onPointerMove);
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, [open, peek]);

  const maxPull = () => (wrapperRef.current?.offsetWidth ?? 270) + EDGE_GAP_PX;

  const onPullStart = (event: PointerEvent<HTMLElement>) => {
    if (open || (event.pointerType === "mouse" && event.button !== 0)) return;
    const base = peek ? maxPull() : 0;
    pull.current = { base, moved: false, offset: base, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPullMove = (event: PointerEvent<HTMLElement>) => {
    const state = pull.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < 6) return;
    if (!state.moved) {
      state.moved = true;
      setDragging(true);
    }
    state.offset = Math.min(maxPull(), Math.max(0, state.base + dx));
    const el = wrapperRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(calc(-100% - ${EDGE_GAP_PX}px + ${state.offset}px))`;
    }
  };

  const onPullEnd = () => {
    const state = pull.current;
    pull.current = null;
    if (!state) return;
    if (state.moved) {
      suppressClick.current = true;
      if (state.offset > maxPull() * PULL_OPEN_RATIO) show();
    }
    const el = wrapperRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    setDragging(false);
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

  if (docked) {
    return (
      <NavMotionContext.Provider value={{ folded: rail, sectionsOpen: sectionsOpen && !rail }}>
      <NavRailContext.Provider value={railView}>
      <RailFlyoutHost enabled={railView}>
        {/* Full-height flat navy column, flush with the left edge: the expand control (and, out, the
            logo) on top, user at the foot. Resting, it is the rail the page is offset by; expanded,
            the same column widens over the page (above the header's left end, under its menus), so
            nothing behind it moves. Every row is laid out at the panel's full width from the start
            and only revealed by the widening, so no icon moves. */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-[45] motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
            expanded ? "w-64" : "w-[var(--app-rail-w,4rem)]"
          )}
          ref={dockedRef}
        >
          <aside
            aria-label={`${title} navigation`}
            className={cn(
              "surface-brand flex h-full flex-col overflow-hidden bg-app-drawer text-on-brand [contain:layout_paint] motion-safe:transition-shadow motion-safe:duration-200",
              expanded && "shadow-lift"
            )}
            id="nav-drawer"
            ref={panelRef}
          >
            {/* The toggle keeps the rail's spot (centred in the 64px column) in both states, so it
                never moves under the pointer; the logo appears to its right when expanded. */}
            <div className="flex h-16 w-64 shrink-0 items-center gap-3 pl-[18px] pr-3">
              <SimpleTooltip label={rail ? "Expand menu" : "Collapse menu"} side="right">
                <button
                  aria-controls="nav-drawer"
                  aria-expanded={expanded}
                  aria-label={rail ? "Expand menu" : "Collapse menu"}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-on-brand-muted transition-colors hover:bg-brand-800 hover:text-on-brand"
                  onClick={toggleExpanded}
                  ref={expandToggleRef}
                  type="button"
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className={cn("size-4 transition-transform duration-200", rail && "rotate-180")}
                    strokeWidth={2.5}
                  />
                </button>
              </SimpleTooltip>
              {railView ? null : (
                <span
                  className={cn(
                    "min-w-0 overflow-hidden transition-opacity duration-150",
                    rail ? "opacity-0" : "opacity-100"
                  )}
                >
                  <Logo compact onDark size={30} />
                </span>
              )}
            </div>
            <nav className="flex min-h-0 w-64 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2 [contain:content] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
              {children}
            </nav>
            <div className="flex w-64 shrink-0 flex-col gap-2 p-3">
              {footer ?? <NavDrawerUser />}
            </div>
          </aside>
        </div>
      </RailFlyoutHost>
      </NavRailContext.Provider>
      </NavMotionContext.Provider>
    );
  }

  return (
    <>
      {/* Backdrop when opened (fades in as it mounts, as on main); a hover peek leaves the page undimmed */}
      {open ? (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-[45] cursor-default bg-scrim/45 motion-safe:animate-overlay-in"
          onClick={close}
          type="button"
        />
      ) : null}

      {/* Mouse-only hot zone on the left screen edge */}
      {!open ? (
        <div
          aria-hidden="true"
          className="fixed inset-y-0 left-0 z-[49] hidden w-2.5 [@media(hover:hover)]:block"
          onPointerEnter={() => setPeek(true)}
        />
      ) : null}

      <div
        className={cn(
          "fixed bottom-3 left-3 top-[72px] z-50 w-[268px] max-w-[calc(100vw-48px)] transition-transform duration-300 will-change-transform max-md:w-[248px]",
          // As a property, not `ease-[…]`: that class lost to `transition-transform`'s own default curve
          // (slow start), which made the drawer feel late even once it was moving.
          "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          // Open is the attribute the store sets on <html> with the tap (sidebarStore `moveDrawer`),
          // not the `open` state, which arrives a frame later.
          "[[data-nav-drawer-open]_&]:translate-x-0",
          peek ? "translate-x-0" : "-translate-x-[calc(100%+12px)]"
        )}
        onPointerLeave={() => {
          if (!pull.current) setPeek(false);
        }}
        ref={wrapperRef}
      >
        <aside
          aria-label={`${title} navigation`}
          id="nav-drawer"
          ref={panelRef}
          className="surface-brand flex h-full flex-col overflow-hidden rounded-panel bg-app-drawer text-on-brand shadow-soft"
        >
          {/* Drawer Header */}
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5",
              "border-app-drawer-border"
            )}
          >
            <Logo compact onDark size={30} />
            {subtitle ? (
              <span
                className={cn(
                  "min-w-0 truncate rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  "border-app-drawer-border text-on-brand-muted"
                )}
              >
                {subtitle}
              </span>
            ) : null}
          </div>

          {/* Drawer Navigation Links */}
          <nav
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 [contain:content] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
          >
            {children}
          </nav>

          {/* Drawer Footer */}
          <div
            className={cn(
              "flex shrink-0 flex-col gap-2 border-t p-2",
              "border-app-drawer-border"
            )}
          >
            {footer ?? <NavDrawerUser />}
          </div>
        </aside>

        {/* Invisible drag strip when closed */}
        {!open && !peek ? (
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
                "h-12 w-1 rounded-full bg-accent/60 transition-opacity duration-200",
                peek || dragging ? "opacity-100" : "opacity-0"
              )}
            />
          </button>
        ) : null}

        {/* Gold tab riding the drawer's edge (as on main) — the only part visible while closed. */}
        <button
          aria-controls="nav-drawer"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={cn(
            "absolute left-full top-1/2 flex h-14 -translate-y-1/2 items-center justify-center bg-accent text-on-accent shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
            open ? "ml-2 w-7 rounded-app" : "w-5 touch-none rounded-r-app hover:w-6"
          )}
          onClick={unlessDragged(toggle)}
          onPointerEnter={(event) => {
            if (!open && event.pointerType === "mouse") setPeek(true);
          }}
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
  accent: "bg-success-soft text-success-ink",
  danger: "bg-app-danger text-on-danger",
  primary: "bg-primary-soft text-primary-ink",
  secondary: "bg-warning-soft text-warning-ink",
  warm: "bg-primary-soft text-primary-ink"
};

const DOT_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-success",
  danger: "bg-app-danger",
  primary: "bg-primary",
  secondary: "bg-warning",
  warm: "bg-primary"
};

function NavBadge({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  if (badge.variant === "dot" || !badge.label) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          DOT_TONE[badge.tone],
          badge.pulse && "motion-safe:animate-pulse"
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-[6.5rem] shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold",
        BADGE_TONE[badge.tone],
        badge.pulse && "motion-safe:animate-pulse"
      )}
    >
      <span className="truncate">{badge.label}</span>
    </span>
  );
}

/** A badge in the rail: a dot on the icon's corner (the tooltip carries the text). */
function RailBadgeDot({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-app-drawer",
        DOT_TONE[badge.tone],
        badge.pulse && "motion-safe:animate-pulse"
      )}
    />
  );
}

export function NavDrawerLink({
  active,
  item
}: {
  active: boolean;
  item: NavItem;
}) {
  const Icon = item.icon;
  const done = useNavDone();
  const rail = useContext(NavRailContext);
  const { folded } = useContext(NavMotionContext);

  return (
    <RailTooltip label={item.badge?.label ? `${item.label} (${item.badge.label})` : item.label}>
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        // The icon sits 10px in, at the rail's spot, in both states; only the pill's width changes.
        "flex h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-control px-2.5 text-sm font-medium transition-[width,background-color,color] duration-200 ease-out",
        folded ? "w-10" : "w-full",
        active
          ? "bg-primary font-semibold text-on-primary"
          : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
      )}
      href={item.href}
      onClick={done}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.3 : 2} />
        {rail && item.badge ? <RailBadgeDot badge={item.badge} /> : null}
      </span>
      <span
        className={cn(
          "flex-1 truncate transition-opacity duration-150",
          folded ? "opacity-0" : "opacity-100 delay-75"
        )}
      >
        {item.label}
      </span>
      {item.badge && !rail ? <NavBadge badge={item.badge} /> : null}
      {item.badge?.label && rail ? <span className="sr-only">{item.badge.label}</span> : null}
    </Link>
    </RailTooltip>
  );
}

/** Hover intent for rail flyouts: a pointer passing over the rail opens nothing. */
const FLYOUT_OPEN_DELAY_MS = 150;
/** Long enough to cross the gap from the icon into the flyout. */
const FLYOUT_CLOSE_DELAY_MS = 250;

type FlyoutOpener = "click" | "hover" | "keyboard";

type FlyoutSection = {
  id: string;
  isItemActive: (href: string) => boolean;
  items: NavItem[];
  label: string;
};

type RailFlyoutApi = {
  activeId: string | null;
  onTriggerClick: (section: FlyoutSection, anchor: HTMLElement, keyboard: boolean) => void;
  onTriggerEnter: (section: FlyoutSection, anchor: HTMLElement) => void;
  onTriggerKeyRight: (section: FlyoutSection, anchor: HTMLElement) => void;
  onTriggerLeave: () => void;
};

const RailFlyoutContext = createContext<RailFlyoutApi | null>(null);

/**
 * The rail's one section flyout. Every section icon shares it: hovering another icon while it is
 * open moves it there (it glides to the new icon and swaps in that section's links) instead of
 * closing one popup and opening another. Opens on click, on hover after a short delay (closing
 * once the pointer has left both icon and flyout for a moment), and from the keyboard (Enter,
 * Space or ArrowRight, focusing the first link; Escape returns to the icon). A hover-opened
 * flyout stays open once its icon is clicked. Portalled, so the rail's overflow can't clip it.
 */
function RailFlyoutHost({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const pathname = usePathname();
  const done = useNavDone();
  type FlyoutState = { anchor: HTMLElement; moved: boolean; opener: FlyoutOpener; section: FlyoutSection };
  const [state, setOpenState] = useState<FlyoutState | null>(null);
  // What the flyout shows: the open state, kept after a close so the exit animation has content.
  const [view, setView] = useState<FlyoutState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const setState = (next: FlyoutState | null) => {
    setOpenState(next);
    if (next) setView(next);
  };
  // How the last flyout was opened, and whether it was closed by a press elsewhere: decides where
  // focus goes once it has closed.
  const lastOpener = useRef<FlyoutOpener>("click");
  const pressedOutside = useRef(false);
  useEffect(() => {
    if (state) {
      lastOpener.current = state.opener;
      pressedOutside.current = false;
    }
  }, [state]);
  const anchorRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const clearTimer = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  const after = (ms: number, action: () => void) => {
    clearTimer();
    timer.current = window.setTimeout(action, ms);
  };
  const show = (section: FlyoutSection, anchor: HTMLElement, opener: FlyoutOpener) => {
    anchorRef.current = anchor;
    const current = stateRef.current;
    setState({ anchor, moved: current !== null && current.section.id !== section.id, opener, section });
  };
  const close = () => {
    clearTimer();
    setState(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Any navigation, or the panel expanding (no rail), puts the flyout away.
  useEffect(() => {
    window.clearTimeout(timer.current);
    setOpenState(null);
  }, [pathname]);
  useEffect(() => {
    if (enabled) return;
    window.clearTimeout(timer.current);
    setOpenState(null);
  }, [enabled]);

  const links = () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);

  // Opened (or moved) from the keyboard: the first link takes focus once the new links are in.
  useEffect(() => {
    if (state?.opener !== "keyboard") return;
    const frame = window.requestAnimationFrame(() => links()[0]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  const api: RailFlyoutApi = {
    activeId: state?.section.id ?? null,
    onTriggerClick: (section, anchor, keyboard) => {
      clearTimer();
      const current = stateRef.current;
      if (current?.section.id === section.id) {
        if (current.opener === "hover" && !keyboard) {
          setState({ ...current, moved: false, opener: "click" });
          return;
        }
        close();
        return;
      }
      show(section, anchor, keyboard ? "keyboard" : "click");
    },
    onTriggerEnter: (section, anchor) => {
      const current = stateRef.current;
      if (current) {
        clearTimer();
        // Already out: move straight to the new section, no delay.
        if (current.section.id !== section.id) show(section, anchor, "hover");
        return;
      }
      after(FLYOUT_OPEN_DELAY_MS, () => show(section, anchor, "hover"));
    },
    onTriggerKeyRight: (section, anchor) => {
      clearTimer();
      if (stateRef.current?.section.id === section.id) links()[0]?.focus();
      else show(section, anchor, "keyboard");
    },
    onTriggerLeave: () => {
      const current = stateRef.current;
      if (!current) {
        clearTimer();
        return;
      }
      if (current.opener === "hover") after(FLYOUT_CLOSE_DELAY_MS, close);
    }
  };

  const onContentEnter = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") clearTimer();
  };
  const onContentLeave = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && stateRef.current?.opener === "hover") {
      after(FLYOUT_CLOSE_DELAY_MS, close);
    }
  };

  const section = view?.section;

  return (
    <RailFlyoutContext.Provider value={api}>
      {children}
      <Popover
        onOpenChange={(next) => {
          if (!next) close();
        }}
        open={state !== null}
      >
        <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
        {section ? (
          <PopoverContent
            align="start"
            aria-label={section.label}
            className="surface-brand w-60 rounded-panel border border-app-drawer-border bg-app-drawer p-2 text-on-brand shadow-lift"
            collisionPadding={12}
            data-moved={view?.moved ? "" : undefined}
            data-rail-flyout=""
            id={`sidebar-flyout-${section.id}`}
            onCloseAutoFocus={(event) => {
              // Back to the icon after Escape or a second click on it; a hover that wandered off, or a
              // press somewhere else, leaves focus where it is.
              event.preventDefault();
              const last = anchorRef.current;
              if (last && stateRef.current === null && lastOpener.current !== "hover" && !pressedOutside.current) {
                last.focus();
              }
            }}
            onInteractOutside={(event) => {
              // A press on another section's icon moves the flyout (its click handler) rather than
              // closing it first.
              const target = event.target;
              if (target instanceof Element && target.closest("[data-nav-flyout-trigger]")) {
                event.preventDefault();
                return;
              }
              pressedOutside.current = true;
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const all = links();
              if (all.length === 0) return;
              event.preventDefault();
              const at = all.indexOf(document.activeElement as HTMLElement);
              const step = event.key === "ArrowDown" ? 1 : -1;
              all[(at + step + all.length) % all.length]?.focus();
            }}
            onOpenAutoFocus={(event) => {
              // Focus is ours: the first link for the keyboard (effect above), nothing for a hover.
              event.preventDefault();
            }}
            onPointerEnter={onContentEnter}
            onPointerLeave={onContentLeave}
            ref={contentRef}
            side="right"
            sideOffset={14}
          >
            {/* Keyed by section: a move cross-fades the links while the panel glides. */}
            <div className="motion-safe:animate-stage-in" key={section.id}>
              <p className="px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-on-brand-muted">
                {section.label}
              </p>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  const active = section.isItemActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-control px-2.5 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app-focus",
                          active
                            ? "bg-primary font-semibold text-on-primary"
                            : "font-medium text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
                        )}
                        href={item.href}
                        onClick={() => {
                          close();
                          done();
                        }}
                      >
                        <ItemIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? <NavBadge badge={item.badge} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
    </RailFlyoutContext.Provider>
  );
}

/** A nav section's icon in the rail: opens (or moves) the shared flyout to its links. */
function RailFlyout({
  icon: Icon,
  id,
  isItemActive,
  items,
  label
}: {
  icon: LucideIcon;
  id: string;
  isItemActive: (href: string) => boolean;
  items: NavItem[];
  label: string;
}) {
  const flyout = useContext(RailFlyoutContext);
  const open = flyout?.activeId === id;
  const holdsRoute = items.some((item) => isItemActive(item.href));
  const section: FlyoutSection = { id, isItemActive, items, label };

  return (
    <button
      aria-controls={open ? `sidebar-flyout-${id}` : undefined}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      className={cn(
        // Same spot as the expanded section's icon (10px in), so swapping the two moves nothing.
        "flex h-10 w-10 items-center rounded-control px-2.5 transition-colors duration-150",
        holdsRoute
          ? "bg-primary text-on-primary"
          : open
            ? "bg-brand-800 text-on-brand"
            : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
      )}
      data-nav-flyout-trigger={id}
      onClick={(event) => flyout?.onTriggerClick(section, event.currentTarget, event.detail === 0)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight") return;
        event.preventDefault();
        flyout?.onTriggerKeyRight(section, event.currentTarget);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") flyout?.onTriggerEnter(section, event.currentTarget);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") flyout?.onTriggerLeave();
      }}
      type="button"
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={holdsRoute ? 2.3 : 2} />
    </button>
  );
}

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
  const done = useNavDone();
  const rail = useContext(NavRailContext);
  const { folded, sectionsOpen } = useContext(NavMotionContext);
  const panelId = `sidebar-submenu-${id}`;
  // Docked: unfolds once the panel is out, folds before it narrows (NavMotionContext).
  const shown = open && sectionsOpen;

  // The rail has no room for a section's links: its icon opens them in a flyout beside it.
  if (rail) {
    return <RailFlyout icon={Icon} id={id} isItemActive={isItemActive} items={items} label={label} />;
  }

  return (
    <div className="flex flex-col">
      <button
        aria-controls={panelId}
        aria-expanded={shown}
        className={cn(
          "flex h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-control px-2.5 text-left text-sm font-medium transition-[width,background-color,color] duration-200 ease-out",
          folded ? "w-10" : "w-full",
          shown
            ? "text-on-brand"
            : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
        </span>
        <span
          className={cn(
            "flex-1 truncate transition-opacity duration-150",
            folded ? "opacity-0" : "opacity-100 delay-75"
          )}
        >
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-[transform,opacity] duration-300",
            folded && "opacity-0",
            shown && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-in-out",
          shown ? "max-h-[800px] pt-1 opacity-100" : "max-h-0 opacity-0"
        )}
        id={panelId}
      >
        <div
          className={cn(
            "ml-5 flex flex-col gap-1 border-l pl-2",
            "border-app-drawer-border"
          )}
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            const active = isItemActive(item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-control px-2.5 text-sm transition-colors duration-150",
                  active
                    ? "bg-primary font-semibold text-on-primary"
                    : "font-medium text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
                )}
                href={item.href}
                key={item.href}
                onClick={done}
                tabIndex={shown ? undefined : -1}
              >
                <ItemIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={2}
                />
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