"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { useAuthStore } from "@/stores/authStore";

/**
 * Renders children only for a platform operator (Nexa's own super admins,
 * `user.isPlatformOperator`). Every academy's owner is a SUPER_ADMIN too, so a
 * role check alone let any owner open the platform pages by URL (FE review
 * AU6). The nav already hides them (`platformOnly`); this covers a typed URL.
 *
 * A UI affordance, not a security boundary: the API refuses every platform
 * route to anyone else (`assertPlatformOperator`).
 */
export function PlatformOperatorOnly({ children }: { children: ReactNode }) {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isOperator = useAuthStore((state) => state.user?.isPlatformOperator === true);

  if (!isHydrated) return null;
  if (!isOperator) {
    return (
      <Alert title="Platform operators only" variant="warning">
        Only NexaChess&apos;s own super admins can use this page.
      </Alert>
    );
  }
  return <>{children}</>;
}
