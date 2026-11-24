"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@nexa-chess/types";
import { useRouter } from "@/lib/navigation";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { switchRole } from "../api/authApi";

/**
 * Multi-role accounts (docs/MULTI_ROLE_ACCOUNTS.md §5.6): switches this login
 * session's role, drops every cached query (they were fetched with the other
 * role's permissions) and lands on the new role's dashboard.
 */
export function useSwitchRole() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const mutation = useMutation({ mutationFn: (role: UserRole) => switchRole({ role }) });

  async function switchTo(role: UserRole) {
    const { user } = await mutation.mutateAsync(role);
    setUser(user);
    queryClient.clear();
    router.replace(getRoleDashboardHref(user.role));
    router.refresh();
  }

  return { isSwitching: mutation.isPending, switchTo };
}

/** "Coach view", "Admin view": the hat this session is wearing. */
export function roleViewLabel(role: UserRole): string {
  switch (role) {
    case "COACH":
      return "Coach view";
    case "SUPER_ADMIN":
      return "Super admin view";
    case "ADMIN":
      return "Admin view";
    case "STUDENT":
      return "Student view";
    default:
      return "Sales view";
  }
}
