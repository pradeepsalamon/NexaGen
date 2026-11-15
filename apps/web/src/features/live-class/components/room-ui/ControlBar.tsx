import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Control bar (spec component 5): 60px tall, 16px radius, large shadow.
 * Groups — media · communication · activities · coach controls · More ·
 * Leave — are split by `ControlBarDivider`. The caller positions it (it
 * floats 16px above the bottom of the stage, centred, never over the panel).
 */
export function ControlBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex h-[3.75rem] max-w-full items-center gap-1 rounded-panel border border-app-border bg-app-surface px-2 shadow-soft md:gap-2 md:px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 1px rule between control groups; hidden on phones, where the bar holds at most seven controls. */
export function ControlBarDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("mx-0.5 hidden h-7 w-px shrink-0 bg-app-border md:block", className)} />;
}
