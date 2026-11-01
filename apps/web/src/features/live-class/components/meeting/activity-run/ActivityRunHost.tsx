"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useIsBoardViewport } from "../../../hooks/useIsBoardViewport";
import { useActivityRun } from "../../../providers/ActivityRunProvider";
import { ActivityRunActions, ActivityRunBody } from "./ActivityRunStage";

/** Below md there is no stage tab, so the activity is a full dialog over the class. */
export function ActivityRunHost() {
  const wide = useIsBoardViewport();
  const { open, run, setOpen } = useActivityRun();
  if (wide || !run) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* No backdrop blur: blurring over live <video> flashes black on mobile GPUs. */}
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto" overlayClassName="bg-black/60 backdrop-blur-none">
        <DialogHeader>
          <DialogTitle>{run.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ActivityRunActions />
          </div>
        </DialogHeader>
        <ActivityRunBody />
      </DialogContent>
    </Dialog>
  );
}
