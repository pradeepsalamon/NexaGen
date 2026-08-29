"use client";

import { useAuthStore } from "@/stores/authStore";
import { resolveTimeZone } from "@/lib/datetime";

/**
 * The timezone every user-facing date should be formatted in: the user's saved
 * `timezone` preference, falling back to the browser's.
 */
export function useUserTimeZone(): string {
  const timezone = useAuthStore((state) => state.user?.timezone);
  return resolveTimeZone(timezone);
}
