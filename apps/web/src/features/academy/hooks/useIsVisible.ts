"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Returns true once `ref` has entered the viewport. Backed by
 * IntersectionObserver so it does no work on scroll.
 */
export function useIsVisible(ref: RefObject<HTMLElement | null>) {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isIntersecting) return;

    if (!("IntersectionObserver" in window)) {
      setIntersecting(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIntersecting(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [isIntersecting, ref]);

  return isIntersecting;
}
