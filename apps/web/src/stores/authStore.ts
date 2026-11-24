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

function persistedUser(user: AuthUser): AuthUser {
  const { phoneNumber: _phone, studentProfile: _student, coachProfile: _coach, ...rest } = user;
  return rest;
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
      // Only what the first paint needs is kept in localStorage; the rest
      // comes from /auth/me on every load (SessionBootstrap). A student's
      // date of birth and parent's contact details, and anyone's phone, never
      // sit in the browser (students are minors; FE review AU4).
      partialize: (state) => ({ user: state.user ? persistedUser(state.user) : undefined })
    }
  )
);

export { getRoleDashboardHref, isStaffRole } from "../lib/routeAccess";


