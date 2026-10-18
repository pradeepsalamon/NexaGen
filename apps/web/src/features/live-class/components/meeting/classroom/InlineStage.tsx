"use client";

import type { ReactNode } from "react";

/** A classroom stage tab for content that is a dialog on phones: a title row with the stage switch, then a scrolling column. */
export function InlineStage({
  title,
  stageSwitch,
  fullWidth = false,
  actions,
  children
}: {
  title: ReactNode;
  /** Header controls between the title and the stage switch. */
  actions?: ReactNode;
  stageSwitch: ReactNode;
  /** Use the whole stage width (board grids) instead of a reading column. */
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-3 room:px-6">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-app-text">{title}</h2>
        {actions}
        {stageSwitch}
      </div>
      {/* Side by side: bottom padding clears the floating toolbar. */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 room:px-6 room:pb-24">
        <div className={fullWidth ? "w-full" : "mx-auto w-full max-w-xl"}>{children}</div>
      </div>
    </section>
  );
}
