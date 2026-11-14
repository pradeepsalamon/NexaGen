"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EDGE =
  "pointer-events-none absolute inset-y-0 z-[1] w-5 transition-opacity duration-200 from-[var(--color-scroll-shade)] to-transparent";

/** Horizontal scroller that shades whichever edge still has content past it. */
export function ScrollShadow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = max - el.scrollLeft > 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div className={cn("w-full overflow-auto", className)} ref={ref}>
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(EDGE, "left-0 rounded-l-[16px] bg-gradient-to-r", edges.left ? "opacity-100" : "opacity-0")}
      />
      <span
        aria-hidden="true"
        className={cn(EDGE, "right-0 rounded-r-[16px] bg-gradient-to-l", edges.right ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
