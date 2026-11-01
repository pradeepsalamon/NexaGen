"use client";

import { useState, type ReactNode } from "react";
import { Eye, Square } from "lucide-react";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useActivityRunControls, useActivityRunMonitor } from "../../../hooks/useActivityRun";
import { useActivityRun } from "../../../providers/ActivityRunProvider";
import { InlineStage } from "../classroom/InlineStage";
import { PuzzleTimerBadge } from "../PuzzleSessionControls";
import { McqMonitorPanel } from "./McqMonitorPanel";
import { McqStudentView } from "./McqStudentView";
import { PlayoutMonitorGallery } from "./PlayoutMonitorGallery";
import { PlayoutStudentView } from "./PlayoutStudentView";

/** The coach's controls are the activity's, never a student's: end it, reveal the answer. */
function ManagerActions({ classId }: { classId: string }) {
  const { run } = useActivityRun();
  const controls = useActivityRunControls(classId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!run) return null;
  const active = run.status === "ACTIVE";
  return (
    <>
      {active ? <PuzzleTimerBadge endsAt={run.endsAt} /> : <Badge variant="secondary">Ended</Badge>}
      {run.kind === "MCQ" && !run.revealedAt ? (
        <Button size="sm" variant="outline" disabled={controls.reveal.isPending} onClick={() => controls.reveal.mutate(run.id)}>
          <Eye className="mr-1.5 size-4" strokeWidth={2.5} /> Reveal answer
        </Button>
      ) : null}
      {active ? (
        <Button size="sm" variant="outline" disabled={controls.end.isPending} onClick={() => setConfirmEnd(true)}>
          <Square className="mr-1.5 size-4" strokeWidth={2.5} /> End activity
        </Button>
      ) : null}
      <ConfirmationModal
        isOpen={confirmEnd}
        title="End this activity for the class?"
        confirmLabel="End activity"
        cancelLabel="Keep it running"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          controls.end.mutate(run.id);
        }}
      >
        Answers and games so far are kept. Anyone still playing stops where they are.
      </ConfirmationModal>
    </>
  );
}

function ManagerBody() {
  const { classId, run } = useActivityRun();
  const monitor = useActivityRunMonitor(classId, run?.id ?? null);
  if (!monitor.data || monitor.data.run.id !== run?.id) {
    return <p className="py-10 text-center text-sm text-app-muted">{monitor.isError ? "Couldn't load the results." : "Loading…"}</p>;
  }
  return monitor.data.kind === "PLAYOUT" ? (
    <PlayoutMonitorGallery classId={classId} monitor={monitor.data} />
  ) : (
    <McqMonitorPanel monitor={monitor.data} />
  );
}

export function ActivityRunBody() {
  const { classId, isManager, run, state } = useActivityRun();
  if (!run) return null;
  if (isManager) return <ManagerBody />;
  if (state?.mcq) return <McqStudentView classId={classId} run={run} mcq={state.mcq} />;
  if (state?.playout) return <PlayoutStudentView key={run.id} classId={classId} run={run} playout={state.playout} />;
  return null;
}

export function ActivityRunActions() {
  const { classId, isManager, run } = useActivityRun();
  if (!run) return null;
  if (isManager) return <ManagerActions classId={classId} />;
  return run.status === "ACTIVE" ? <PuzzleTimerBadge endsAt={run.endsAt} /> : <Badge variant="secondary">Ended</Badge>;
}

/** The activity as a classroom stage tab (md and up). */
export function ActivityRunStage({ stageSwitch }: { stageSwitch: ReactNode }) {
  const { isManager, run } = useActivityRun();
  if (!run) return null;
  const wide = isManager ? true : run.kind === "PLAYOUT";
  return (
    <InlineStage title={run.title} stageSwitch={stageSwitch} fullWidth={wide} actions={<ActivityRunActions />}>
      <ActivityRunBody />
    </InlineStage>
  );
}
