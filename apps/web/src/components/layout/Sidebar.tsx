"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode
} from "react";
import type { NavItem } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn } from "@/lib/utils";

/** Signed-in user pinned to the drawer's foot; links to their profile. */
function NavDrawerUser() {
  const user = useAuthStore((state) => state.user);

  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    user.email.slice(0, 1).toUpperCase();

  return (
    <Link
      className={cn(
        "flex items-center gap-3 rounded-control p-2 transition-colors duration-150",
        "text-on-brand hover:bg-brand-800"
      )}
      href="/profile"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          "bg-primary-soft text-primary-ink"
        )}
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span
          className={cn(
            "block truncate text-xs",
            "text-on-brand-muted"
          )}
        >
          {user.email}
        </span>
      </span>
    </Link>
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
    panelRef.current?.toggleAttribute("inert", !open && !peek);
    if (open) setPeek(false);
  }, [open, peek]);

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

  return (
    <>
      {/* Backdrop when opened; a hover peek leaves the page undimmed */}
      {open ? (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-[45] cursor-default bg-scrim/45 backdrop-blur-[1px] transition-opacity duration-200"
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
            <span className="font-display text-base font-bold tracking-tight">
              {title}
            </span>
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

        {/* Gold tab on the drawer's edge. Closed on a phone it fits inside the page gutter, so it covers no content. */}
        <button
          aria-controls="nav-drawer"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={cn(
            "absolute left-full top-1/2 flex h-14 -translate-y-1/2 items-center justify-center bg-accent text-on-accent shadow-lift transition-[width,margin,border-radius] duration-300 cursor-pointer",
            open
              ? "ml-2 w-7 rounded-control"
              : "w-2.5 touch-none rounded-r-control md:w-5 md:hover:w-6"
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
            className={cn(
              "size-3.5 transition-transform duration-300",
              open ? "" : "rotate-180 max-md:hidden"
            )}
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
        "inline-flex max-w-[6.5rem] shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
        BADGE_TONE[badge.tone],
        badge.pulse && "motion-safe:animate-pulse"
      )}
    >
      <span className="truncate">{badge.label}</span>
    </span>
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

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-brand-700 font-semibold text-on-brand shadow-[inset_3px_0_0_rgb(var(--rgb-accent))]"
          : "text-on-brand-muted hover:bg-brand-800 hover:text-on-brand"
      )}
      href={item.href}
      onClick={close}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.3 : 2} />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? <NavBadge badge={item.badge} /> : null}
    </Link>
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
  const panelId = `sidebar-submenu-${id}`;

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
                    ? "bg-brand-700 font-semibold text-on-brand shadow-[inset_3px_0_0_rgb(var(--rgb-accent))]"
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