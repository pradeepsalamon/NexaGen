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

/** On `<html>` while the drawer is out; the drawer's slide is CSS on this attribute alone. */
export const NAV_DRAWER_OPEN_ATTRIBUTE = "data-nav-drawer-open";

/** What was last asked for. `open` in the store follows one frame later. */
let drawerTarget = false;

/**
 * Starts the drawer's slide with the tap. The attribute changes now, so the browser begins the
 * transform on the next frame; React hears about it after that frame is painted. Doing both at
 * once made a slow phone finish re-rendering the nav and header before the drawer moved at all.
 */
function moveDrawer(open: boolean, commit: (open: boolean) => void) {
  drawerTarget = open;
  if (typeof document === "undefined") return commit(open);
  document.documentElement.toggleAttribute(NAV_DRAWER_OPEN_ATTRIBUTE, open);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    commit(drawerTarget);
  };
  requestAnimationFrame(() => setTimeout(finish, 0));
  // A hidden tab runs no animation frames.
  setTimeout(finish, 120);
}

/**
 * The role nav: docked (expanded or a rail) from `xl`, an off-canvas drawer
 * below it. Driven by the drawer's own controls and the header's menu button.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => {
      const commit = (open: boolean) => set((state) => (state.open === open ? state : { open }));
      return {
      available: false,
      collapsed: false,
      open: false,
      close: () => {
        // Called on every route change and resize; nothing to do while it is already in.
        if (drawerTarget || get().open) moveDrawer(false, commit);
      },
      setAvailable: (available) => {
        if (!available) moveDrawer(false, commit);
        set({ available });
      },
      setCollapsed: (collapsed) => set({ collapsed }),
      show: () => moveDrawer(true, commit),
      toggle: () => moveDrawer(!drawerTarget, commit),
      toggleCollapsed: () =>
        set((state) => {
          const collapsed = !state.collapsed;
          // Start the column's width animation with the click, not after React re-renders the nav.
          if (typeof document !== "undefined") document.documentElement.dataset.nav = collapsed ? "collapsed" : "expanded";
          return { collapsed };
        })
      };
    },
    {
      name: SIDEBAR_STORAGE_KEY,
      partialize: (state) => ({ collapsed: state.collapsed })
    }
  )
);
