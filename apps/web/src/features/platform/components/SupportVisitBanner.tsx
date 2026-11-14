"use client";

import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { getCurrentUser } from "@/features/auth/api/authApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";

/**
 * Shown on every page while this browser is a platform support visit (§I):
 * who is in, why, and until when. Reads the session query SessionBootstrap
 * already holds, so it costs no extra request.
 */
export function SupportVisitBanner() {
  const timeZone = useUserTimeZone();
  const hasUser = useAuthStore((state) => Boolean(state.user));
  const session = useQuery({
    enabled: hasUser,
    queryFn: getCurrentUser,
    queryKey: queryKeys.auth.session,
    staleTime: 60_000
  });
  const support = session.data?.support;
  if (!support) return null;

  return (
    <div
      className="sticky top-16 z-30 flex flex-wrap items-center gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-sm text-warning-ink"
      role="status"
    >
      <LifeBuoy aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
      <span className="font-semibold">NexaChess support visit</span>
      <span className="min-w-0 flex-1">
        {support.staffName ? `${support.staffName} · ` : ""}
        {support.reason} · ends {formatTime(support.expiresAt, timeZone)}. Every change is logged for the academy.
      </span>
    </div>
  );
}
