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
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

/** Signed-in user pinned to the drawer's foot; links to their profile. */
function NavDrawerUser() {
  const user = useAuthStore((state) => state.user);
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    user.email.slice(0, 1).toUpperCase();

  return (
    <Link
      className={cn(
        "flex items-center gap-3 rounded-[14px] p-2.5 transition-colors duration-150 border",
        isDark
          ? "bg-[#0B1D3F] border-white/10 text-white hover:bg-[#102652]"
          : "bg-[#F8FAFC] border-[#E8EDF5] text-[#071B41] hover:bg-[#EEF2F7]"
      )}
      href="/profile"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold",
          isDark
            ? "bg-[#1A2E56] text-[#E2B355]"
            : "bg-[#FDF3DC] text-[#C58927]"
        )}
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{name}</span>
        <span
          className={cn(
            "block truncate text-[11px]",
            isDark ? "text-[#94A3B8]" : "text-[#64748B]"
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

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

  const isVisible = open || peek;

  return (
    <>
      {/* Backdrop when opened or hovered */}
      {isVisible ? (
        <button
          aria-label="Close sidebar"
          className={cn(
            "fixed inset-0 z-[45] cursor-default transition-opacity duration-200",
            open ? "bg-black/45 backdrop-blur-[1px]" : "bg-black/15 pointer-events-none"
          )}
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
          ref={panelRef}
          style={{
            backgroundColor: isDark ? "#06132B" : "#FFFFFF"
          }}
          className={cn(
            "flex h-full flex-col overflow-hidden rounded-[22px] border transition-colors duration-200",
            isDark
              ? "bg-[#06132B] border-white/15 text-white shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
              : "bg-white border-[#DCE3EE] text-[#071B41] shadow-[0_20px_50px_rgba(7,27,65,0.22)]"
          )}
        >
          {/* Drawer Header */}
          <div
            style={{
              backgroundColor: isDark ? "#081735" : "#FAFBFD"
            }}
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5",
              isDark ? "border-white/10" : "border-[#EEF2F7]"
            )}
          >
            <span className="font-[family-name:var(--font-playfair)] text-base font-bold tracking-tight">
              {title}
            </span>
            {subtitle ? (
              <span
                className={cn(
                  "min-w-0 truncate rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                  isDark
                    ? "border-[#E2B355]/35 bg-[#E2B355]/15 text-[#E2B355]"
                    : "border-[#F3DFB6] bg-[#FDF3DC] text-[#C58927]"
                )}
              >
                {subtitle}
              </span>
            ) : null}
          </div>

          {/* Drawer Navigation Links */}
          <nav
            style={{
              backgroundColor: isDark ? "#06132B" : "#FFFFFF"
            }}
            className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-3.5 py-3.5 [contain:content] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
          >
            {children}
          </nav>

          {/* Drawer Footer */}
          <div
            style={{
              backgroundColor: isDark ? "#081735" : "#FAFBFD"
            }}
            className={cn(
              "flex shrink-0 flex-col gap-2 border-t p-3",
              isDark ? "border-white/10" : "border-[#EEF2F7]"
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
                "h-12 w-1 rounded-full bg-[#D49B35]/60 transition-opacity duration-200",
                peek || dragging ? "opacity-100" : "opacity-0"
              )}
            />
          </button>
        ) : null}

        {/* Gold Tab Handle on the right edge of the drawer */}
        <button
          aria-expanded={open}
          aria-label={open ? "Close sidebar" : "Open sidebar"}
          className={cn(
            "absolute left-full top-1/2 flex h-14 -translate-y-1/2 items-center justify-center bg-gradient-to-b from-[#E6B960] to-[#CC922C] text-[#071B41] shadow-md transition-[width,margin,border-radius] duration-300 cursor-pointer",
            open
              ? "ml-2 w-7 rounded-xl"
              : "w-5 touch-none rounded-r-xl hover:w-6"
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
              open ? "" : "rotate-180"
            )}
            strokeWidth={2.75}
          />
        </button>
      </div>
    </>
  );
}

const BADGE_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-[#FDF3DC] text-[#C58927]",
  danger: "bg-red-500 text-white",
  primary: "bg-[#071B41] text-white",
  secondary: "bg-[#E5B85B] text-[#071B41]",
  warm: "bg-amber-500/20 text-amber-500"
};

const DOT_TONE: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  accent: "bg-[#D49B35]",
  danger: "bg-red-500",
  primary: "bg-[#071B41]",
  secondary: "bg-[#E5B85B]",
  warm: "bg-amber-500"
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-150",
        active
          ? isDark
            ? "bg-[#192D54] text-[#E2B355] border border-[#E2B355]/35 font-bold shadow-2xs"
            : "bg-[#FDF3DC] text-[#071B41] border border-[#F3DFB6] font-bold shadow-2xs"
          : isDark
            ? "text-[#C8CDD6] hover:bg-[#0D2147] hover:text-white"
            : "text-[#3B4454] hover:bg-[#F1F5F9] hover:text-[#071B41]"
      )}
      href={item.href}
      onClick={close}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-[18px]",
            active
              ? isDark
                ? "text-[#E2B355]"
                : "text-[#C58927]"
              : isDark
                ? "text-[#8E98A8]"
                : "text-[#64748B]"
          )}
          strokeWidth={active ? 2.3 : 2}
        />
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const panelId = `sidebar-submenu-${id}`;

  return (
    <div className="flex flex-col">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-left transition-colors duration-150",
          open
            ? isDark
              ? "bg-[#0D2147] text-white"
              : "bg-[#F1F5F9] text-[#071B41]"
            : isDark
              ? "text-[#C8CDD6] hover:bg-[#0D2147] hover:text-white"
              : "text-[#3B4454] hover:bg-[#F1F5F9] hover:text-[#071B41]"
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={2} />
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
          open ? "max-h-[800px] pt-1.5 opacity-100" : "max-h-0 opacity-0"
        )}
        id={panelId}
      >
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl p-2 ml-3 border-l",
            isDark
              ? "border-white/10 bg-[#081735]"
              : "border-[#E2E8F0] bg-[#F8FAFC]"
          )}
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            const active = isItemActive(item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs transition-colors duration-150",
                  active
                    ? isDark
                      ? "bg-[#192D54] text-[#E2B355] font-bold"
                      : "bg-[#FDF3DC] text-[#071B41] font-bold"
                    : isDark
                      ? "text-[#C8CDD6] hover:bg-[#0D2147] hover:text-white font-medium"
                      : "text-[#3B4454] hover:bg-white hover:text-[#071B41] font-medium"
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