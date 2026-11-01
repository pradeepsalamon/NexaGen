"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  PLAYOUT_END_REASON_LABELS,
  PLAYOUT_RESULT_LABELS,
  type PlayoutMonitorEntry,
  type PlayoutMonitorResponse
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { useActivityRunGame } from "../../../hooks/useActivityRun";
import { PuzzleBoardTile } from "../PuzzleBoardTile";
import { SimulMoveList } from "../simul/SimulMoveList";

type StatusFilter = "ALL" | PlayoutMonitorEntry["status"];

const STATUS_LABEL: Record<PlayoutMonitorEntry["status"], string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "Playing",
  PENDING: "Not started"
};

const STATUS_ORDER: Record<PlayoutMonitorEntry["status"], number> = { COMPLETED: 0, IN_PROGRESS: 1, PENDING: 2 };

const STATUS_FILTERS = [
  { label: "Everyone", value: "ALL" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Playing", value: "IN_PROGRESS" },
  { label: "Not started", value: "PENDING" }
];

const SORT_OPTIONS = [
  { label: "Name", value: "name" },
  { label: "Completed first", value: "done" },
  { label: "Not started first", value: "pending" }
];

/** Its own per-second tick, so the clock never re-renders a board. */
function ElapsedTime({ startedAt, finishedAt }: { startedAt: string | null; finishedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, finishedAt]);
  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

function statusBadge(entry: PlayoutMonitorEntry) {
  if (entry.status === "COMPLETED") {
    return entry.goalAchieved ? (
      <Badge variant="success" className="shrink-0">
        <Check className="mr-0.5 size-3" strokeWidth={3} aria-hidden="true" /> Goal
      </Badge>
    ) : (
      <Badge variant="secondary" className="shrink-0">
        Finished
      </Badge>
    );
  }
  return (
    <Badge variant={entry.status === "IN_PROGRESS" ? "warning" : "outline"} className="shrink-0">
      {STATUS_LABEL[entry.status]}
    </Badge>
  );
}

/** Memoized on the entry: one student moving repaints one board. View-only by construction. */
const StudentBoardCard = memo(function StudentBoardCard({
  entry,
  startFen,
  studentColor,
  onOpen
}: {
  entry: PlayoutMonitorEntry;
  startFen: string;
  studentColor: "white" | "black";
  onOpen: (studentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.studentId)}
      aria-label={`Open ${entry.studentName}'s board`}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-app border bg-app-surface p-2 text-left transition-colors hover:border-primary/60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        entry.status === "COMPLETED" && entry.goalAchieved ? "border-success/60" : "border-app-border"
      )}
    >
      <PuzzleBoardTile fen={entry.fen ?? startFen} orientation={studentColor} lastMove={entry.lastMoveUci ?? undefined} />
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-xs font-semibold text-app-text">{entry.studentName}</span>
        {statusBadge(entry)}
      </div>
      <p className="flex items-center justify-between gap-2 text-xs text-app-muted">
        <span className="truncate">
          {entry.gameId
            ? entry.status === "COMPLETED"
              ? entry.endReason
                ? PLAYOUT_END_REASON_LABELS[entry.endReason]
                : "Finished"
              : entry.turn === "COMPUTER"
                ? "Computer to move"
                : "Student to move"
            : "Waiting"}
          {entry.lastMoveSan ? ` · ${entry.lastMoveSan}` : ""}
        </span>
        <ElapsedTime startedAt={entry.startedAt} finishedAt={entry.finishedAt} />
      </p>
      {entry.gameId ? (
        <p className="truncate text-xs text-app-muted">
          {studentColor === "white" ? "White" : "Black"} · {entry.studentMoves} {entry.studentMoves === 1 ? "move" : "moves"}
          {entry.attemptNumber > 1 ? ` · try ${entry.attemptNumber}` : ""}
          {entry.progress ? ` · ${entry.progress}` : ""}
        </p>
      ) : null}
    </button>
  );
});

/** One student's board, enlarged. Read only: this dialog has no control that writes anything. */
function StudentBoardDialog({
  classId,
  entry,
  monitor,
  onClose
}: {
  classId: string;
  entry: PlayoutMonitorEntry | null;
  monitor: PlayoutMonitorResponse;
  onClose: () => void;
}) {
  const detail = useActivityRunGame(classId, monitor.run.id, entry?.gameId ?? null, entry?.ply ?? 0);
  const game = detail.data?.game;
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry?.studentName}</DialogTitle>
          <DialogDescription>{monitor.goalText} You are watching: nothing here can change the student&apos;s game.</DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <PuzzleBoardTile
              fen={entry.fen ?? monitor.startFen}
              orientation={monitor.studentColor}
              lastMove={entry.lastMoveUci ?? undefined}
            />
            <div className="min-w-0 space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {[
                  ["Status", STATUS_LABEL[entry.status]],
                  ["Goal", entry.goalAchieved ? "Achieved" : entry.status === "COMPLETED" ? "Not achieved" : "In progress"],
                  ["Result", entry.result ? PLAYOUT_RESULT_LABELS[entry.result] : "—"],
                  ["Score", entry.score !== null ? `${entry.score} / ${monitor.maxScore}` : "—"],
                  ["Moves", String(entry.studentMoves)],
                  ["Try", String(entry.attemptNumber || "—")],
                  ["Computer", monitor.computerLabel]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-app-muted">{label}</dt>
                    <dd className="truncate font-semibold text-app-text">{value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-app-muted">Time</dt>
                  <dd className="font-semibold text-app-text">
                    <ElapsedTime startedAt={entry.startedAt} finishedAt={entry.finishedAt} />
                  </dd>
                </div>
              </dl>
              {game ? (
                <SimulMoveList
                  moves={game.moves}
                  blackStarts={game.startFen.split(" ")[1] === "b"}
                  className="max-h-56 rounded-app border border-app-border p-2"
                />
              ) : entry.gameId ? (
                <p className="text-xs text-app-muted">Loading the moves…</p>
              ) : (
                <p className="text-xs text-app-muted">This student hasn&apos;t started yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Every student's board at once, updating live. Strictly watching: there is no write path here. */
export function PlayoutMonitorGallery({ classId, monitor }: { classId: string; monitor: PlayoutMonitorResponse }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState("name");
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = monitor.entries.filter(
      (e) => (filter === "ALL" || e.status === filter) && (!q || e.studentName.toLowerCase().includes(q))
    );
    if (sort === "name") return list;
    const direction = sort === "done" ? 1 : -1;
    return [...list].sort(
      (a, b) => direction * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.studentName.localeCompare(b.studentName)
    );
  }, [monitor.entries, search, filter, sort]);

  const counts = useMemo(() => {
    const done = monitor.entries.filter((e) => e.status === "COMPLETED").length;
    const goals = monitor.entries.filter((e) => e.goalAchieved).length;
    const playing = monitor.entries.filter((e) => e.status === "IN_PROGRESS").length;
    return { done, goals, playing };
  }, [monitor.entries]);

  const open = monitor.entries.find((e) => e.studentId === openId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-app-muted">
          <span className="font-semibold text-app-text">{monitor.goalText}</span> {counts.goals} reached the goal ·{" "}
          {counts.playing} playing · {counts.done} finished of {monitor.entries.length}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative w-44">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" aria-hidden="true" />
            <Input
              aria-label="Search students"
              placeholder="Search students"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select aria-label="Filter by status" className="w-36" options={STATUS_FILTERS} value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)} />
          <Select aria-label="Sort students" className="w-40" options={SORT_OPTIONS} value={sort} onChange={(e) => setSort(e.target.value)} />
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          variant="inline"
          title={monitor.entries.length === 0 ? "No students yet" : "No students match"}
          description={monitor.entries.length === 0 ? "Boards appear here as soon as students join." : "Try a different search or filter."}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-3">
          {entries.map((entry) => (
            <StudentBoardCard
              key={entry.studentId}
              entry={entry}
              startFen={monitor.startFen}
              studentColor={monitor.studentColor}
              onOpen={setOpenId}
            />
          ))}
        </div>
      )}

      <StudentBoardDialog classId={classId} entry={open} monitor={monitor} onClose={() => setOpenId(null)} />
    </div>
  );
}
