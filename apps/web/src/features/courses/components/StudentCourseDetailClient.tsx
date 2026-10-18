"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { PgnBoardViewer } from "@/features/assignments/components/PgnBoardViewer";
import { useCompleteModule, useMyCourse } from "../hooks/useCoursesApi";

export function StudentCourseDetailClient({ id }: { id: string }) {
  const { data, isLoading } = useMyCourse(id);
  const complete = useCompleteModule(id);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const course = data.course;
  const modules = [...course.modules].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">{course.title}</h1>
        {course.description && <p className="mt-1 text-sm text-app-muted">{course.description}</p>}
        <div className="mt-3 flex items-center gap-3">
          <div
            aria-label={`${course.progressPercent}% complete`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={course.progressPercent}
            className="h-2 w-48 overflow-hidden rounded-full bg-app-soft"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-warm to-primary transition-[width] duration-700 ease-out"
              style={{ width: `${course.progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-extrabold text-app-text">
            {course.completedModuleCount} / {course.moduleCount} complete
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {modules.map((m, index) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  m.completed ? "bg-primary text-white" : "bg-app-soft text-app-muted"
                }`}
              >
                {m.completed ? <CheckCircle2 className="size-4" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-app-text">{m.title}</p>
                <Badge variant="outline">{m.contentType === "ASSIGNMENT" ? "Assignment" : "Puzzle"}</Badge>
              </div>

              {m.contentType === "PUZZLE" && m.puzzle ? (
                <Button asChild size="sm">
                  <Link href={`/student/puzzles/${m.puzzle.id}`}>
                    <Puzzle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    Solve
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenModuleId(openModuleId === m.id ? null : m.id)}
                >
                  {openModuleId === m.id ? (
                    <ChevronUp className="size-4" strokeWidth={2.5} />
                  ) : (
                    <ChevronDown className="size-4" strokeWidth={2.5} />
                  )}
                  {openModuleId === m.id ? "Hide" : "View"}
                </Button>
              )}
            </div>

            {m.contentType === "ASSIGNMENT" && m.assignment && openModuleId === m.id && (
              <div className="mt-4 border-t border-app-border pt-4">
                <PgnBoardViewer pgn={m.assignment.pgn} />
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    disabled={m.completed || complete.isPending}
                    onClick={() => complete.mutate(m.id)}
                  >
                    {m.completed ? "Completed" : "Mark complete"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
