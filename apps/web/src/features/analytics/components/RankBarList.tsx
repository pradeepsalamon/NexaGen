"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface RankRow {
  key: string;
  label: string;
  sublabel?: string | null;
  value: number;
  display?: string;
  href?: string;
}

/** A compact horizontal-bar ranking — clearer than a bar chart for "who's on top". */
export function RankBarList({
  rows,
  emptyMessage = "No data for this period.",
  max
}: {
  rows: RankRow[];
  emptyMessage?: string;
  max?: number;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-app-muted">{emptyMessage}</p>;
  }
  const peak = max ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const width = `${Math.max(2, (row.value / peak) * 100)}%`;
        const label = (
          <span className="truncate font-medium text-app-text">{row.label}</span>
        );
        return (
          <li key={row.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              {row.href ? (
                <Link className="truncate hover:text-primary-ink hover:underline" href={row.href}>
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="shrink-0 font-semibold text-app-text">
                {row.display ?? row.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-app-soft">
              <div
                className={cn("h-full rounded-full bg-primary")}
                style={{ width }}
              />
            </div>
            {row.sublabel ? (
              <p className="mt-0.5 truncate text-xs text-app-muted">{row.sublabel}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
