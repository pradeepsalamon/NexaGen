"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video } from "lucide-react";
import type { PresenceLiveClass } from "@nexa-chess/types";

/** Asks once, on a real click, so a later pull can alert a backgrounded tab. */
function askNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => undefined);
  }
}

/**
 * Bottom-right "Live now" pill on every page while one of the student's
 * classes (or the coach's own class) is live. Hidden inside the classroom itself.
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

  return (
    <Link
      aria-label={`${variant === "coach" ? "Return to" : "Join"} live class: ${liveClass.topic}`}
      className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-full bg-app-danger py-2 pl-2 pr-5 text-white shadow-card transition hover:scale-[1.02] hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus motion-reduce:hover:scale-100 sm:bottom-6 sm:right-6"
      href={`/live-class/${liveClass.classId}`}
      onClick={askNotificationPermission}
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/30 motion-reduce:animate-none" />
        <Video aria-hidden="true" className="relative size-5" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.7rem] font-extrabold uppercase tracking-wide opacity-90">
          {variant === "coach" ? "Your class is live · Return" : "Live now · Join"}
        </span>
        <span className="block truncate text-sm font-bold">{liveClass.topic}</span>
      </span>
    </Link>
  );
}
