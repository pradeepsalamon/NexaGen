import { create } from "zustand";

type SidebarState = {
  /** A role nav drawer is mounted — the header shows its menu button only then. */
  available: boolean;
  open: boolean;
  close: () => void;
  setAvailable: (available: boolean) => void;
  show: () => void;
  toggle: () => void;
};

/** Shared open state for the role nav drawer, driven by both the drawer's own toggle and the header's menu button. */
export const useSidebarStore = create<SidebarState>((set) => ({
  available: false,
  open: false,
  close: () => set({ open: false }),
  setAvailable: (available) => set(available ? { available } : { available, open: false }),
  show: () => set({ open: true }),
  toggle: () => set((state) => ({ open: !state.open }))
}));
