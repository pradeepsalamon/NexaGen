import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@nexa-chess/types";

type AuthState = {
  clearSession: () => void;
  isHydrated: boolean;
  isSessionChecked: boolean;
  isSessionLoading: boolean;
  setHydrated: (isHydrated: boolean) => void;
  setSessionChecked: (isSessionChecked: boolean) => void;
  setSessionLoading: (isSessionLoading: boolean) => void;
  setUser: (user: AuthUser) => void;
  user?: AuthUser;
};

/**
 * The only part of the signed-in user kept in localStorage: what the first
 * paint needs (nav, role routing, avatar, dates in the right zone). No email,
 * surname, phone, date of birth or parent contact (students are minors; FE
 * review AU4, owner 2026-11-24 option b). The rest comes from /auth/me on
 * every load (SessionBootstrap). `features/legal/content.ts` says the same.
 */
type CachedUser = Pick<
  AuthUser,
  "avatarUrl" | "extraRoles" | "firstName" | "id" | "isPlatformOperator" | "primaryRole" | "role" | "roles" | "timezone"
>;

function cachedUser(user: AuthUser): CachedUser {
  return {
    avatarUrl: user.avatarUrl,
    extraRoles: user.extraRoles,
    firstName: user.firstName,
    id: user.id,
    isPlatformOperator: user.isPlatformOperator,
    primaryRole: user.primaryRole,
    role: user.role,
    roles: user.roles,
    timezone: user.timezone
  };
}

/**
 * A cached user until /auth/me answers: the missing account fields are blank
 * (email "") or neutral (verified, active) so nothing flashes a banner, and the
 * real values replace them a moment later.
 */
function userFromCache(cached: CachedUser): AuthUser {
  return { ...cachedUser(cached as AuthUser), email: "", isEmailVerified: true, status: "ACTIVE" };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isHydrated: false,
      isSessionChecked: false,
      isSessionLoading: true,
      clearSession: () =>
        set({
          isSessionChecked: true,
          isSessionLoading: false,
          user: undefined
        }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      setSessionChecked: (isSessionChecked) => set({ isSessionChecked }),
      setSessionLoading: (isSessionLoading) => set({ isSessionLoading }),
      setUser: (user) =>
        set({
          isSessionChecked: true,
          isSessionLoading: false,
          user
        })
    }),
    {
      name: "nexa-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      // Only `CachedUser` is kept in localStorage (see cachedUser above).
      merge: (persisted, current) => {
        const cached = (persisted as { user?: CachedUser } | undefined)?.user;
        return { ...current, user: cached?.id && cached.role ? userFromCache(cached) : undefined };
      },
      partialize: (state) => ({ user: state.user ? cachedUser(state.user) : undefined })
    }
  )
);

export { getRoleDashboardHref, isStaffRole } from "../lib/routeAccess";


