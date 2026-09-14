"use client";

import { useState } from "react";
import type { CourseModuleSummary } from "@nexa-chess/types";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useRemoveModule, useReorderModules } from "../hooks/useCoursesApi";
import { AttachModuleModal } from "./AttachModuleModal";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

export function ModuleList({
  courseId,
  modules
}: {
  courseId: string;
  modules: CourseModuleSummary[];
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const { run: runRemove } = useRemoveModule(courseId);
  const reorder = useReorderModules(courseId);

  const sorted = [...modules].sort((a, b) => a.order - b.order);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({ moduleIds: next.map((m) => m.id) });
  };

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-tight text-app-text">Modules</h2>
        <Button size="sm" onClick={() => setAttachOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add module
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No modules yet"
          description="Add an existing assignment or puzzle to get started."
        />
      ) : (
        <ol className="grid gap-2">
          {sorted.map((m, index) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-app border border-app-border bg-app-surface p-3"
            >
              <span className="w-6 shrink-0 text-center text-sm font-extrabold text-app-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-app-text">{m.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">
                    {m.contentType === "ASSIGNMENT" ? "Assignment" : "Puzzle"}
                  </Badge>
                  <span className="truncate text-xs text-app-muted">
                    {m.contentType === "ASSIGNMENT" ? m.assignment?.title : m.puzzle?.title}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <SimpleTooltip label="Move up">
                  <Button
                    aria-label="Move module up"
                    variant="outline"
                    size="icon"
                    className={iconBtn}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip label="Move down">
                  <Button
                    aria-label="Move module down"
                    variant="outline"
                    size="icon"
                    className={iconBtn}
                    disabled={index === sorted.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip label="Remove">
                  <Button
                    aria-label="Remove module"
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:bg-app-danger hover:text-white"
                    onClick={() => runRemove(m.id)}
                  >
                    <Trash2 className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              </div>
            </li>
          ))}
        </ol>
      )}

      <AttachModuleModal courseId={courseId} open={attachOpen} onOpenChange={setAttachOpen} />
    </Card>
  );
}
