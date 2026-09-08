"use client";

import { useState } from "react";
import type { AssignmentLibraryItem } from "@nexa-chess/types";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useAssignmentLibrary } from "../hooks/useAssignmentsApi";
import { deleteAssignment } from "../api/assignmentApi";
import { AssignmentFormDialog } from "./AssignmentFormDialog";
import { AssignmentPreviewDialog } from "./AssignmentPreviewDialog";
import { ActivityBadge, DifficultyBadge } from "./assignmentBadges";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

export function AdminAssignmentsClient() {
  const { data, isLoading } = useAssignmentLibrary();

  const { run: runDelete } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (item: AssignmentLibraryItem) => deleteAssignment(item.id),
    undo: async () => {},
    toast: (item) => ({
      title: `Deleting "${item.title}"`,
      message: "Removes it from every batch it was assigned to."
    }),
    invalidates: [queryKeys.assignments.all]
  });

  const library = data?.assignments ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentLibraryItem | null>(null);
  const [previewing, setPreviewing] = useState<AssignmentLibraryItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-app-text">
              Assignment library
            </h1>
            <p className="mt-1 text-app-muted">
              Shared PGN assignments. Coaches assign these to their own batches.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New assignment
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-40 p-4">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>
        ) : library.length === 0 ? (
          <Card className="p-6 sm:p-12">
            <EmptyState
              icon={Plus}
              title="No shared assignments yet"
              description="Create a PGN assignment for coaches to hand out."
              action={{ label: "New assignment", onClick: openCreate }}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {library.map((item) => (
              <Card key={item.id} className="flex flex-col gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setPreviewing(item)}
                  className="text-left font-semibold text-app-text hover:text-primary"
                >
                  {item.title}
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <ActivityBadge activityType={item.activityType} />
                  <DifficultyBadge difficulty={item.difficulty} />
                  <span className="text-xs text-app-muted">
                    {item.deploymentCount} deployment{item.deploymentCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Button
                    aria-label="Preview"
                    variant="outline"
                    size="icon"
                    className={iconBtn}
                    onClick={() => setPreviewing(item)}
                  >
                    <Eye className="size-4" strokeWidth={2.5} />
                  </Button>
                  {item.canManage && (
                    <>
                      <Button
                        aria-label="Edit assignment"
                        variant="outline"
                        size="icon"
                        className={iconBtn}
                        onClick={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" strokeWidth={2.5} />
                      </Button>
                      <Button
                        aria-label="Delete assignment"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-red-600 hover:text-white"
                        onClick={() => runDelete(item)}
                      >
                        <Trash2 className="size-4" strokeWidth={2.5} />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <AssignmentFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={editing ? "edit" : "create"}
          assignment={editing}
        />
        <AssignmentPreviewDialog
          open={!!previewing}
          onOpenChange={(open) => !open && setPreviewing(null)}
          assignment={previewing}
        />
      </div>
    </main>
  );
}
