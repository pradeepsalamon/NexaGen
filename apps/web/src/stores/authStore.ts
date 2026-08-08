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
      partialize: (state) => ({ user: state.user })
    }
  )
);

export function getRoleDashboardHref(role?: string): string {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return "/admin";
  }
  if (role === "COACH") {
    return "/coach";
  }
  if (role === "STUDENT") {
    return "/student";
  }
  return "/";
}


