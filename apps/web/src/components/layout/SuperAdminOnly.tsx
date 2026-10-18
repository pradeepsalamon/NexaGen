"use client";

import type { ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * Renders children only for SUPER_ADMIN.
 *
 * This is a UI affordance, not a security boundary — the API enforces the role
 * on every request. Its purpose is to stop plain ADMIN users from navigating
 * into surfaces that would always 401. See AUDIT.md H1.
 */
export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated || user?.role !== "SUPER_ADMIN") {
    return null;
  }

  return <>{children}</>;
}
