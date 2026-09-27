"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { NavItem } from "@/components/layout/navItems";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn } from "@/lib/utils";

/**
 * Off-canvas role nav. Closed by default with a 12px edge peeking out; opens as
 * an overlay above the page (and header) with a backdrop. Escape, the backdrop,
 * a link click or any route change closes it.
 */
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
  const toggle = useSidebarStore((state) => state.toggle);
  const setAvailable = useSidebarStore((state) => state.setAvailable);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  // React 18 has no `inert` prop; keeps the hidden nav out of the tab order.
  useEffect(() => {
    bodyRef.current?.toggleAttribute("inert", !open);
  }, [open]);

  return (
    <>
      {open ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-[45] cursor-default bg-black/40 transition-opacity duration-300"
          onClick={close}
          type="button"
        />
      ) : null}

      <button
        aria-expanded={open}
        aria-label={open ? "Close sidebar" : "Open sidebar"}
        className={cn(
          "fixed top-20 z-[55] flex size-8 items-center justify-center rounded-full bg-secondary text-black shadow-lg transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
          open ? "left-[264px] max-md:left-[224px]" : "left-0"
        )}
        onClick={toggle}
        type="button"
      >
        <ChevronLeft
          aria-hidden="true"
          className={cn("size-3.5 transition-transform duration-300", open ? "" : "rotate-180")}
          strokeWidth={2.75}
        />
      </button>

      <aside
        aria-label="Main navigation"
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-[280px] flex-col overflow-y-auto overflow-x-hidden rounded-r-[20px] bg-primary transition-transform duration-300 [scrollbar-width:none] max-md:w-[240px] dark:border-r dark:border-app-border dark:bg-app-surface [&::-webkit-scrollbar]:hidden",
          open ? "translate-x-0" : "-translate-x-[calc(100%-12px)]"
        )}
      >
        <div
          className={cn(
            "flex min-h-full flex-col transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
          ref={bodyRef}
        >
          <div className="px-5 pb-7 pt-6 text-center">
            <h2 className="text-base font-bold leading-snug text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-white/60">{subtitle}</p>
            ) : null}
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-[14px] pb-6">{children}</nav>

          {footer ? <div className="flex flex-col gap-2 px-[14px] pb-6">{footer}</div> : null}
        </div>
      </aside>
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
  "flex h-10 w-full items-center gap-1.5 rounded-[10px] px-2.5 text-base font-semibold leading-5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";
const ROW_ACTIVE = "bg-secondary text-black shadow-[0px_1px_2px_rgba(14,15,17,0.06)]";
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
        className={cn(ROW_BASE, "text-left", open ? ROW_ACTIVE : ROW_IDLE)}
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
          "overflow-hidden transition-all duration-300 ease-in-out",
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
                  "flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm leading-5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                  active
                    ? "bg-white font-semibold text-primary shadow-[0px_1px_2px_rgba(14,15,17,0.08)]"
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
