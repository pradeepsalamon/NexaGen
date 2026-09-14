"use client";

import { useMemo, useState } from "react";
import type { CourseModuleContentType } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAssignmentLibrary } from "@/features/assignments/hooks/useAssignmentsApi";
import { usePuzzles } from "@/features/puzzles/hooks/usePuzzlesApi";
import { PUZZLE_TYPE_LABELS } from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAttachModule } from "../hooks/useCoursesApi";

export function AttachModuleModal({
  courseId,
  open,
  onOpenChange
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<CourseModuleContentType>("PUZZLE");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const attach = useAttachModule(courseId);

  const puzzles = usePuzzles({
    status: "PUBLISHED",
    scope: "all",
    search: debouncedSearch || undefined,
    pageSize: 25
  });
  const assignments = useAssignmentLibrary();
  const filteredAssignments = useMemo(() => {
    const rows = assignments.data?.assignments ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    return q ? rows.filter((a) => a.title.toLowerCase().includes(q)) : rows;
  }, [assignments.data, debouncedSearch]);

  const handleAttach = (title: string, contentId: string) => {
    attach.mutate(
      tab === "PUZZLE"
        ? { title, contentType: "PUZZLE", puzzleId: contentId }
        : { title, contentType: "ASSIGNMENT", assignmentId: contentId },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a module</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "PUZZLE" ? "primary" : "outline"}
            onClick={() => setTab("PUZZLE")}
          >
            Puzzle
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "ASSIGNMENT" ? "primary" : "outline"}
            onClick={() => setTab("ASSIGNMENT")}
          >
            Assignment
          </Button>
        </div>

        <p className="text-xs text-app-muted">
          {tab === "ASSIGNMENT"
            ? "Course modules show assignments as a read-only walkthrough — interactive assignment types (Solve the line, Play vs engine, Free analysis) play the same as Replay here."
            : "Students solve the real, interactive puzzle."}
        </p>

        <Input
          placeholder={tab === "PUZZLE" ? "Search puzzles…" : "Search assignments…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-[46vh] space-y-2 overflow-y-auto">
          {tab === "PUZZLE" ? (
            puzzles.isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : (puzzles.data?.puzzles.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-app-muted">No published puzzles match.</p>
            ) : (
              puzzles.data?.puzzles.map((puzzle) => (
                <div
                  key={puzzle.id}
                  className="flex items-center justify-between gap-3 rounded-app border border-app-border bg-app-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-app-text">{puzzle.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{puzzle.topicName}</Badge>
                      <Badge variant="outline">{PUZZLE_TYPE_LABELS[puzzle.puzzleType]}</Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={attach.isPending}
                    onClick={() => handleAttach(puzzle.title, puzzle.id)}
                  >
                    Add
                  </Button>
                </div>
              ))
            )
          ) : assignments.isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : filteredAssignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-app-muted">No assignments match.</p>
          ) : (
            filteredAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3 rounded-app border border-app-border bg-app-surface p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-text">{assignment.title}</p>
                  <Badge variant="outline">{assignment.activityType}</Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={attach.isPending}
                  onClick={() => handleAttach(assignment.title, assignment.id)}
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
