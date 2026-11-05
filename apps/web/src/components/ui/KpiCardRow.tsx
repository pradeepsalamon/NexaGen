"use client";

import { useRef, type ReactNode } from "react";
import { useScrollableRegion } from "@/hooks/useScrollableRegion";
import { cn } from "@/lib/utils";

/**
 * KPI card layout: a horizontal snap-scroll strip on mobile, a wrapping grid on
 * larger screens. Children are `<KpiCard>`s.
 */
export function KpiCardRow({
  children,
  className,
  columns = 4,
  label = "Key figures"
}: {
  children: ReactNode;
  className?: string;
  columns?: 3 | 4 | 5;
  /** The strip's accessible name while it scrolls (phones). */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // A scroll strip only on phones; from `sm` it wraps and adds no Tab stop.
  const region = useScrollableRegion(ref, label);
  const grid = {
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
  }[columns];

  return (
    <div
      className={cn(
        "grid auto-cols-[75%] grid-flow-col gap-3 overflow-x-auto pb-2 snap-x snap-mandatory",
        "sm:auto-cols-auto sm:grid-flow-row sm:overflow-visible sm:pb-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        grid,
        className
      )}
      ref={ref}
      {...region}
    >
      {children}
    </div>
  );
}
