import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@nexa-gen/types";

type AuthState = {
  clearSession: () => void;
  setUser: (user: AuthUser) => void;
  user?: AuthUser;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clearSession: () => set({ user: undefined }),
      setUser: (user) => set({ user })
    }),
    {
      name: "nexagen-auth"
    }
  )
);
