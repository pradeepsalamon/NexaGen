"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Keyboard access for a scroll container (WCAG 2.1.1, axe
 * `scrollable-region-focusable`): while its content overflows, it becomes a
 * focusable, named region so arrow keys can scroll it. When nothing overflows
 * it adds no Tab stop.
 */
export function useScrollableRegion(ref: RefObject<HTMLElement | null>, label: string) {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1;
      setScrollable((prev) => (prev === next ? prev : next));
    };
    const observer = new ResizeObserver(update);
    const observeAll = () => {
      observer.disconnect();
      observer.observe(el);
      for (const child of Array.from(el.children)) observer.observe(child);
      update();
    };
    observeAll();
    // Rows and cards that arrive after loading change the overflow too.
    const mutations = new MutationObserver(observeAll);
    mutations.observe(el, { childList: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [ref]);

  return scrollable
    ? ({ "aria-label": label, role: "region", tabIndex: 0 } as const)
    : ({} as Record<string, never>);
}
