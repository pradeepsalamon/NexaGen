import { create } from "zustand";

type UiState = {
  closeSidebar: () => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  closeSidebar: () => set({ isSidebarOpen: false }),
  isSidebarOpen: false,
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }))
}));
