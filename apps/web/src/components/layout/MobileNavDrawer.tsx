"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import {
  coachNavItems,
  getAdminNavItems,
  studentNavItems,
  type NavItem
} from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

function getItemsForRole(role?: string): NavItem[] | null {
  switch (role) {
    case "STUDENT":
      return studentNavItems;
    case "COACH":
      return coachNavItems;
    case "ADMIN":
    case "SUPER_ADMIN":
      return getAdminNavItems(role);
    default:
      return null;
  }
}

export function MobileNavDrawer() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const items = getItemsForRole(user?.role);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!isHydrated || !items) {
    return null;
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="fixed bottom-5 right-5 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--color-primary)_35%,transparent)] transition active:scale-95 hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus md:hidden"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={2.5} />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-l border-app-border bg-app-surface shadow-soft outline-none",
            "data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in"
          )}
        >
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3.5">
            <DialogPrimitive.Title asChild>
              <span>
                <Logo compact size={36} />
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close navigation menu"
              className="inline-flex size-9 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3 pb-24">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/student" &&
                  item.href !== "/coach" &&
                  item.href !== "/admin" &&
                  item.href !== "/profile" &&
                  pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-4 py-3 text-sm font-bold transition",
                    isActive
                      ? "bg-secondary text-black shadow-card"
                      : "text-app-muted hover:bg-app-soft hover:text-primary"
                  )}
                >
                  <Icon aria-hidden="true" className="h-5 w-5 flex-none" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
