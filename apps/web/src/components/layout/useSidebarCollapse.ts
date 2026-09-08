"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "nexa-sidebar-collapsed";

/**
 * Shared collapse state for the role dashboards' desktop sidebar. Defaults to the
 * collapsed rail (the panel expands as an overlay); the pinned choice persists to
 * localStorage so it survives navigation and reloads.
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) !== "0");
    } catch {
      /* no stored preference */
    }
    setHydrated(true);
  }, []);

  const write = (next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const toggle = () =>
    setCollapsed((prev) => {
      write(!prev);
      return !prev;
    });

  const collapse = () =>
    setCollapsed((prev) => {
      if (prev) return prev;
      write(true);
      return true;
    });

  return { collapse, collapsed, hydrated, toggle };
}
