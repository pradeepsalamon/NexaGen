import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Also read before first paint by the root layout's init script: keep the two in sync. */
export const SIDEBAR_STORAGE_KEY = "nexa-sidebar";

type SidebarState = {
  /** A role nav drawer is mounted — the header shows its menu button only then. */
  available: boolean;
  /** From `xl`: the docked sidebar is an icon rail. Saved per browser. */
  collapsed: boolean;
  /** Below `xl`: the off-canvas drawer is out. */
  open: boolean;
  close: () => void;
  setAvailable: (available: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  show: () => void;
  toggle: () => void;
  toggleCollapsed: () => void;
};

/**
 * The role nav: docked (expanded or a rail) from `xl`, an off-canvas drawer
 * below it. Driven by the drawer's own controls and the header's menu button.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      available: false,
      collapsed: false,
      open: false,
      close: () => set({ open: false }),
      setAvailable: (available) => set(available ? { available } : { available, open: false }),
      setCollapsed: (collapsed) => set({ collapsed }),
      show: () => set({ open: true }),
      toggle: () => set((state) => ({ open: !state.open })),
      toggleCollapsed: () =>
        set((state) => {
          const collapsed = !state.collapsed;
          // Start the column's width animation with the click, not after React re-renders the nav.
          if (typeof document !== "undefined") document.documentElement.dataset.nav = collapsed ? "collapsed" : "expanded";
          return { collapsed };
        })
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      partialize: (state) => ({ collapsed: state.collapsed })
    }
  )
);
