"use client";

import type { ReactNode } from "react";
import { StageHeader } from "./StageHeader";

/** A classroom stage tab for content that is a dialog on phones: a title row with the stage switch, then a scrolling column. */
export function InlineStage({
  title,
  stageSwitch,
  fullWidth = false,
  actions,
  children
}: {
  title?: ReactNode;
  /** Header controls between the title and the stage switch. */
  actions?: ReactNode;
  stageSwitch: ReactNode;
  /** Use the whole stage width (board grids) instead of a reading column. */
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <StageHeader nav={stageSwitch} title={title} actions={actions} className="px-3 pt-3 room:px-6" />
      {/* Bottom padding clears the control bar floating over the stage. */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-3 room:px-6">
        <div className={fullWidth ? "w-full" : "mx-auto w-full max-w-xl"}>{children}</div>
      </div>
    </section>
  );
}
