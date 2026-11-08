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
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn, enumLabel } from "@/lib/utils";

/** From here the nav is docked beside the page instead of an off-canvas drawer. */
export const NAV_DOCKED_QUERY = "(min-width: 1280px)";

/** True while the docked nav is collapsed to an icon rail: labels become tooltips. */
const NavRailContext = createContext(false);

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
  const rail = useContext(NavRailContext);

  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <RailTooltip label={name}>
    <Link
      className={cn(
        "flex items-center gap-3 rounded-app border border-app-drawer-border bg-brand-800 p-2 text-on-brand transition-colors duration-150 hover:bg-brand-700",
        rail && "justify-center border-transparent bg-transparent px-0"
      )}
      href="/profile"
    >
      <Avatar className="font-bold" imageUrl={user.avatarUrl} name={name} size="sm" />
      <span className={cn("min-w-0 flex-1", rail && "sr-only")}>
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
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);
  const docked = useMediaQuery(NAV_DOCKED_QUERY);
  const rail = docked && collapsed;

  const panelRef = useRef<HTMLElement>(null);
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
    return () => setAvailable(false);
  }, [setAvailable]);

  // `--app-nav-w` (globals.css) sizes the docked column and AppShell's offset.
  // The root layout's init script sets it before paint; this keeps it current.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nav = collapsed ? "collapsed" : "expanded";
    return () => {
      delete root.dataset.nav;
    };
  }, [collapsed]);

  // Widening past `xl` docks the nav: an open drawer or a peek has no meaning there.
  useEffect(() => {
    if (!docked) return;
    close();
    setPeek(false);
  }, [close, docked]);

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
      <NavRailContext.Provider value={rail}>
        {/* Full-height navy card left of the header: logo and collapse control on top, user at the foot. */}
        <div className="fixed inset-y-0 left-0 z-30 w-[var(--app-nav-w)] py-2 pl-2 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out">
          <aside
            aria-label={`${title} navigation`}
            className="surface-brand flex h-full flex-col overflow-hidden rounded-panel bg-app-drawer text-on-brand shadow-lift [contain:layout_paint]"
            id="nav-drawer"
            ref={panelRef}
          >
            <div
              className={cn(
                "flex h-14 shrink-0 items-center gap-2",
                rail ? "justify-center" : "justify-between pl-4 pr-3"
              )}
            >
              {rail ? null : (
                <span className="min-w-0 overflow-hidden">
                  <Logo compact onDark size={30} />
                </span>
              )}
              <SimpleTooltip label={rail ? "Expand menu" : "Collapse menu"} side="right">
                <button
                  aria-controls="nav-drawer"
                  aria-expanded={!collapsed}
                  aria-label={rail ? "Expand menu" : "Collapse menu"}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-control border border-app-drawer-border text-on-brand-muted transition-colors hover:bg-brand-800 hover:text-on-brand"
                  onClick={toggleCollapsed}
                  type="button"
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className={cn("size-4 transition-transform duration-200", rail && "rotate-180")}
                    strokeWidth={2.5}
                  />
                </button>
              </SimpleTooltip>
            </div>
            <nav
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain [contain:content] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0",
                rail ? "p-2" : "px-3 py-2"
              )}
            >
              {children}
            </nav>
            <div className={cn("flex shrink-0 flex-col gap-2", rail ? "p-2" : "p-3")}>
              {footer ?? <NavDrawerUser />}
            </div>
          </aside>
        </div>
      </NavRailContext.Provider>
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
          "fixed bottom-3 left-3 top-[72px] z-50 w-[268px] max-w-[calc(100vw-48px)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] max-md:w-[248px]",
          open
            ? "translate-x-0"
            : peek
              ? "translate-x-0"
              : "-translate-x-[calc(100%+12px)]"
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
          className="surface-brand flex h-full flex-col overflow-hidden rounded-panel border border-app-drawer-border bg-app-drawer text-on-brand shadow-soft"
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
            "absolute left-full top-1/2 flex h-14 -translate-y-1/2 items-center justify-center bg-accent text-on-accent shadow-lift transition-[width,margin,border-radius] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
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
  const close = useSidebarStore((state) => state.close);
  const rail = useContext(NavRailContext);

  return (
    <RailTooltip label={item.badge?.label ? `${item.label} (${item.badge.label})` : item.label}>
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-primary font-semibold text-on-primary shadow-card"
          : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand",
        rail && "justify-center px-0"
      )}
      href={item.href}
      onClick={close}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.3 : 2} />
        {rail && item.badge ? <RailBadgeDot badge={item.badge} /> : null}
      </span>
      <span className={cn("flex-1 truncate", rail && "sr-only")}>{item.label}</span>
      {item.badge && !rail ? <NavBadge badge={item.badge} /> : null}
      {item.badge?.label && rail ? <span className="sr-only">{item.badge.label}</span> : null}
    </Link>
    </RailTooltip>
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
  const close = useSidebarStore((state) => state.close);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const rail = useContext(NavRailContext);
  const panelId = `sidebar-submenu-${id}`;

  // The rail has no room for a section's links: its icon widens the nav and opens the section.
  if (rail) {
    const holdsRoute = items.some((item) => isItemActive(item.href));
    return (
      <SimpleTooltip label={label} side="right">
        <button
          aria-label={`${label}: expand the menu`}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-control transition-colors duration-150",
            holdsRoute
              ? "bg-primary text-on-primary shadow-card"
              : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
          )}
          onClick={() => {
            setCollapsed(false);
            if (!open) onToggle();
          }}
          type="button"
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={holdsRoute ? 2.3 : 2} />
        </button>
      </SimpleTooltip>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium transition-colors duration-150",
          open
            ? "text-on-brand"
            : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
        </span>
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform duration-300",
            open && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-in-out",
          open ? "max-h-[800px] pt-1 opacity-100" : "max-h-0 opacity-0"
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
                    ? "bg-primary font-semibold text-on-primary shadow-card"
                    : "font-medium text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
                )}
                href={item.href}
                key={item.href}
                onClick={close}
                tabIndex={open ? undefined : -1}
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