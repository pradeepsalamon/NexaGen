"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video } from "lucide-react";
import type { PresenceLiveClass } from "@nexa-chess/types";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Asks once, on a real click, so a later pull can alert a backgrounded tab. */
function askNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => undefined);
  }
}

/**
 * Bottom-right "Live now" card on every page while one of the student's
 * classes (or the coach's own class) is live. Hidden inside the classroom itself.
 *
 * Design System v2: a floating surface (`shadow-lift`), red only for the Live
 * dot and word (danger = destructive + LIVE), and one blue action. The whole
 * card is the link, so the action is styled, not a nested button.
 */
export function LiveClassFab({
  liveClass,
  variant = "student",
}: {
  liveClass: PresenceLiveClass | null;
  variant?: "student" | "coach";
}) {
  const pathname = usePathname();
  if (!liveClass || pathname?.startsWith("/live-class/")) return null;

  const action = variant === "coach" ? "Return" : "Join";
  return (
    <Link
      aria-label={`${variant === "coach" ? "Return to" : "Join"} live class: ${liveClass.topic}`}
      className="group fixed bottom-5 right-5 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] items-center gap-3 rounded-panel border border-app-border bg-app-surface p-3 text-app-text shadow-lift transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:bottom-6 sm:right-6"
      href={`/live-class/${liveClass.classId}`}
      onClick={askNotificationPermission}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-app-danger-soft text-app-danger-ink">
        <Video aria-hidden="true" className="size-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-app-danger-ink">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-app-danger motion-safe:animate-pulse" />
          {variant === "coach" ? "Your class is live" : "Live now"}
        </span>
        <span className="block truncate text-sm font-semibold">{liveClass.topic}</span>
      </span>
      <span aria-hidden="true" className={cn(buttonVariants({ size: "sm" }), "shrink-0 pointer-events-none")}>
        {action}
      </span>
    </Link>
  );
}
