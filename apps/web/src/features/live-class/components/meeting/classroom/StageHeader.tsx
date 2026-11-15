"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The coach's "what the class sees" controls, rendered at the right end of every stage header. */
const StagePresentationContext = createContext<ReactNode>(null);

export function StagePresentationProvider({ value, children }: { value: ReactNode; children: ReactNode }) {
  return <StagePresentationContext.Provider value={value}>{children}</StagePresentationContext.Provider>;
}

/**
 * Stage header (spec: Regions): one 36px row, 12px below the top bar. The
 * stage switch on the left, then the stage's own title and actions, and the
 * coach's presentation controls on the right. Wraps on a narrow stage
 * instead of running under the panel.
 */
export function StageHeader({
  nav,
  title,
  actions,
  className,
}: {
  /** The stage switch (`RoomTabs`). */
  nav?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const presentation = useContext(StagePresentationContext);
  return (
    <div className={cn("flex min-h-9 shrink-0 flex-wrap items-center gap-2", className)}>
      {nav}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {title ? <h2 className="min-w-0 truncate text-sm font-semibold text-app-text">{title}</h2> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      {presentation}
    </div>
  );
}
