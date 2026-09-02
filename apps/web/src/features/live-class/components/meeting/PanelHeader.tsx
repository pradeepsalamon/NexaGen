import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent sub-header for the sidebar panels (chat / participants /
 * settings). Sits directly under the sidebar's tab strip.
 */
export function PanelHeader({
  title,
  count,
  actions,
  className,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-2 border-b border-app-border/60 px-4",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-app-muted">
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-app-soft px-1.5 py-0.5 text-[10px] tabular-nums text-app-muted">
            {count}
          </span>
        )}
      </span>
      {actions}
    </div>
  );
}
