"use client";

import { Loader2 } from "lucide-react";
import { ACTIVITY_RESPONSE_LABELS, type ActivityQueue } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useActivityQueueProgress } from "../../hooks/useActivityQueue";
import { ActivityKindIcon, ResponseLegend, ResponseStateIcon } from "./activityQueueUi";

/**
 * Coach view: one row per student, one column per puzzle / question the class
 * has reached. Responses are read from the activities themselves (puzzle
 * attempts, poll answers), so the grid matches the leaderboard and Response tab.
 */
export function ActivityQueueProgressGrid({ classId, queue }: { classId: string; queue: ActivityQueue }) {
  const progress = useActivityQueueProgress(classId, queue.id, queue.status === "LIVE");
  const columns = queue.items.filter((i) => i.activatedAt && i.kind !== "CHAPTER" && progress.data?.cells[i.id]);

  if (progress.isLoading) {
    return (
      <p className="flex items-center gap-2 py-3 text-xs text-app-muted">
        <Loader2 className="size-3.5 animate-spin" /> Loading responses…
      </p>
    );
  }
  if (progress.isError || !progress.data) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-app border border-app-border p-3 text-xs text-app-muted">
        Couldn&apos;t load responses.
        <Button size="sm" variant="outline" onClick={() => void progress.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (columns.length === 0) {
    return (
      <p className="rounded-app border border-dashed border-app-border p-3 text-xs text-app-muted">
        Responses appear here once the class reaches a puzzle or a question.
      </p>
    );
  }
  const { students, cells, respondedCounts } = progress.data;

  return (
    <div className="space-y-2">
      {/* Scrolls sideways inside its own box on a narrow panel — never the page. */}
      <div className="custom-scrollbar max-w-full overflow-x-auto rounded-app border border-app-border">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Each student&apos;s response to each activity</caption>
          <thead>
            <tr className="bg-app-soft/60">
              <th scope="col" className="sticky left-0 z-10 bg-app-surface px-2 py-1.5 text-left font-semibold text-app-muted">
                Student
              </th>
              {columns.map((item) => (
                <th
                  key={item.id}
                  scope="col"
                  className={cn("px-1.5 py-1.5 text-center font-semibold", item.id === queue.currentItemId ? "text-primary-ink" : "text-app-muted")}
                >
                  <SimpleTooltip label={`${item.position + 1}. ${item.title}`}>
                    <span className="inline-flex items-center gap-0.5" tabIndex={0} aria-label={`Activity ${item.position + 1}: ${item.title}`}>
                      <ActivityKindIcon kind={item.kind} className="size-3" />
                      {item.position + 1}
                    </span>
                  </SimpleTooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-2 py-3 text-center text-app-muted">
                  No students in this class yet.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.studentId} className="border-t border-app-border/60">
                  <th scope="row" className="sticky left-0 z-10 max-w-[9rem] truncate bg-app-surface px-2 py-1 text-left font-medium text-app-text">
                    {student.studentName}
                  </th>
                  {columns.map((item) => {
                    const cell = cells[item.id]?.[student.studentId];
                    if (!cell) return <td key={item.id} />;
                    const label = `${student.studentName} — ${ACTIVITY_RESPONSE_LABELS[cell.state]}${cell.detail ? ` (${cell.detail})` : ""}`;
                    return (
                      <td key={item.id} className="px-1.5 py-1 text-center">
                        <SimpleTooltip label={label}>
                          <span tabIndex={0} aria-label={label} className="inline-flex">
                            <ResponseStateIcon state={cell.state} />
                          </span>
                        </SimpleTooltip>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-app-border bg-app-soft/60">
              <th scope="row" className="sticky left-0 z-10 bg-app-surface px-2 py-1 text-left font-semibold text-app-muted">
                Responded
              </th>
              {columns.map((item) => (
                <td key={item.id} className="px-1.5 py-1 text-center font-semibold tabular-nums text-app-text">
                  {respondedCounts[item.id] ?? 0}/{students.length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <ResponseLegend />
    </div>
  );
}
