import { create } from "zustand";

/**
 * One dashboard pop-up at a time. The homework reminder and the feedback
 * pop-up each open on their own data; without this, a student with overdue
 * homework got two stacked modals and the one underneath was unreachable.
 * Whoever claims first shows; the other waits until it is released.
 */
type DashboardPopupState = {
  owner: string | null;
  /** True when `id` now holds (or already held) the slot. */
  claim: (id: string) => boolean;
  release: (id: string) => void;
};

export const useDashboardPopup = create<DashboardPopupState>((set, get) => ({
  owner: null,
  claim: (id) => {
    const owner = get().owner;
    if (owner && owner !== id) return false;
    if (owner !== id) set({ owner: id });
    return true;
  },
  release: (id) => {
    if (get().owner === id) set({ owner: null });
  },
}));
