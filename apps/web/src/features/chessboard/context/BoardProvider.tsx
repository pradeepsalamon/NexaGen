import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useStore } from "zustand";
import { createBoardStore, BoardStore } from "../store/createBoardStore";
import { installBoardTestHarness } from "../lib/testHarness";

// The context holds the store instance, not the state itself
export const BoardContext = createContext<ReturnType<typeof createBoardStore> | null>(null);

export interface BoardProviderProps {
  children: ReactNode;
}

export function BoardProvider({ children }: BoardProviderProps) {
  // Use state to ensure the store is created only once per provider instance
  const [store] = useState(() => createBoardStore());

  useEffect(() => installBoardTestHarness(store), [store]);

  return (
    <BoardContext.Provider value={store}>
      {children}
    </BoardContext.Provider>
  );
}

// Hook to use the store
export function useBoardStore<T>(selector: (state: BoardStore) => T): T;
export function useBoardStore(): BoardStore;
export function useBoardStore<T>(selector?: (state: BoardStore) => T) {
  const store = useContext(BoardContext);
  if (!store) {
    throw new Error("useBoardStore must be used within a BoardProvider");
  }
  return useStore(store, selector!);
}
