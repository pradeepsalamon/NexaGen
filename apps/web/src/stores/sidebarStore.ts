import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Also read before first paint by the root layout's init script: keep the two in sync. */
export const SIDEBAR_STORAGE_KEY = "nexa-sidebar";

type SidebarState = {
  /** A role nav drawer is mounted — the header shows its menu button only then. */
  available: boolean;
  /**
   * Saved per browser before 2026-11-17, when it chose between a docked 16rem nav and the rail.
   * The rail is now always the resting state, so nothing reads it; kept (with the storage key)
   * so an older saved value still loads cleanly.
   */
  collapsed: boolean;
  /** From `xl`: the full nav panel is out over the page (never saved; every load starts on the rail). */
  expanded: boolean;
  /** Below `xl`: the off-canvas drawer is out. */
  open: boolean;
  close: () => void;
  setAvailable: (available: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  show: () => void;
  toggle: () => void;
  toggleExpanded: () => void;
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
 * The role nav: from `xl` a fixed icon rail whose full panel slides out over the page
 * (`expanded`), an off-canvas drawer below it. Driven by the drawer's own controls and the header's menu button.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => {
      const commit = (open: boolean) => set((state) => (state.open === open ? state : { open }));
      return {
      available: false,
      collapsed: false,
      expanded: false,
      open: false,
      close: () => {
        // Called on every route change and resize; nothing to do while it is already in.
        if (drawerTarget || get().open) moveDrawer(false, commit);
      },
      setAvailable: (available) => {
        if (!available) moveDrawer(false, commit);
        set({ available });
      },
      setExpanded: (expanded) => set((state) => (state.expanded === expanded ? state : { expanded })),
      show: () => moveDrawer(true, commit),
      toggle: () => moveDrawer(!drawerTarget, commit),
      toggleExpanded: () => set((state) => ({ expanded: !state.expanded }))
      };
    },
    {
      name: SIDEBAR_STORAGE_KEY,
      partialize: (state) => ({ collapsed: state.collapsed })
    }
  )
);
