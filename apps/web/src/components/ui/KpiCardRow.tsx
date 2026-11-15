"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KPI card layout: two per row on phones (never a sideways-scrolling strip,
 * owner 2026-11-06), more columns on larger screens. Children are `<KpiCard>`s.
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
  /** Accessible name of the group. */
  label?: string;
}) {
  const grid = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-3 xl:grid-cols-5"
  }[columns];

  return (
    <div
      aria-label={label}
      className={cn("grid grid-cols-2 gap-3 sm:gap-4", grid, className)}
      role="group"
    >
      {children}
    </div>
  );
}
