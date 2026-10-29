"use client";

import { useState } from "react";
import type { AssignmentDeployment, AssignmentLibraryItem } from "@nexa-chess/types";
import { Eye, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { useAssignmentDeployments, useAssignmentLibrary } from "../hooks/useAssignmentsApi";
import { deleteAssignment, undeployAssignment } from "../api/assignmentApi";
import { AssignmentFormDialog } from "./AssignmentFormDialog";
import { AssignmentPreviewDialog } from "./AssignmentPreviewDialog";
import { AssignmentSubmissionsDialog } from "./AssignmentSubmissionsDialog";
import { DeployAssignmentDialog } from "./DeployAssignmentDialog";
import { ActivityBadge, DifficultyBadge, DueBadge } from "./assignmentBadges";
import { AssignmentOverviewPanel } from "./reminders/AssignmentOverviewPanel";
import { Badge } from "@/components/ui/Badge";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-on-primary";

export function CoachAssignmentsClient() {
  const timeZone = useUserTimeZone();
  const { data: libraryData, isLoading: libraryLoading } = useAssignmentLibrary();
  const { data: deploymentsData, isLoading: deploymentsLoading } = useAssignmentDeployments();
  const { data: batchesData } = useCoachBatches();

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

  const { run: runWithdraw } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (d: AssignmentDeployment) => undeployAssignment(d.id),
    undo: async () => {},
    toast: (d) => ({
      title: `Withdrawing "${d.title}"`,
      message: `From ${d.batchName}. Student progress will be lost.`
    }),
    invalidates: [queryKeys.assignments.all]
  });

  const batches = batchesData?.batches ?? [];
  const library = libraryData?.assignments ?? [];
  const deployments = deploymentsData?.deployments ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentLibraryItem | null>(null);
  const [deploying, setDeploying] = useState<AssignmentLibraryItem | null>(null);
  const [previewing, setPreviewing] = useState<AssignmentLibraryItem | null>(null);
  const [submissionsFor, setSubmissionsFor] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: AssignmentLibraryItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Assignments</h1>
          <p className="mt-1 text-app-muted">
            Build PGN assignments and send them to your batches with a due date.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New assignment
        </Button>
      </div>

      <Tabs defaultValue="library">
        <TabsList className="justify-self-end">
          <TabsTrigger value="library">Library ({library.length})</TabsTrigger>
          <TabsTrigger value="assigned">Assigned ({deployments.length})</TabsTrigger>
          <TabsTrigger value="due">Due dates</TabsTrigger>
        </TabsList>

        <TabsContent value="due">
          <AssignmentOverviewPanel />
        </TabsContent>

        <TabsContent value="library">
          {libraryLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="h-40 p-4">
                  <Skeleton className="h-full w-full" />
                </Card>
              ))}
            </div>
          ) : library.length === 0 ? (
            <Card>
              <EmptyState variant="inline"
                icon={Plus}
                title="No assignments yet"
                description="Create your first PGN assignment, or wait for an admin to add shared ones."
                action={{ label: "New assignment", onClick: openCreate }}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {library.map((item) => (
                <Card key={item.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewing(item)}
                      className="text-left font-semibold text-app-text hover:text-primary-ink"
                    >
                      {item.title}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.activityType === "PUZZLE_SET" && (
                      <ActivityBadge activityType={item.activityType} />
                    )}
                    <DifficultyBadge difficulty={item.difficulty} />
                    {item.isLibrary && (
                      <Badge variant="outline">
                        Shared{item.createdByName ? ` · ${item.createdByName}` : ""}
                      </Badge>
                    )}
                    <span className="text-xs text-app-muted">
                      {item.puzzles
                        ? `${item.puzzles.length} ${item.puzzles.length === 1 ? "puzzle" : "puzzles"} · `
                        : ""}
                      {item.deploymentCount} deployment{item.deploymentCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => setDeploying(item)} disabled={batches.length === 0}>
                      <Send className="mr-1.5 size-3.5" strokeWidth={2.5} />
                      Assign
                    </Button>
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
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="size-4" strokeWidth={2.5} />
                        </Button>
                        <Button
                          aria-label="Delete assignment"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
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
        </TabsContent>

        <TabsContent value="assigned">
          {deploymentsLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : deployments.length === 0 ? (
            <Card>
              <EmptyState variant="inline"
                icon={Send}
                title="Nothing assigned yet"
                description="Pick an assignment from the Library tab and send it to a batch."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {deployments.map((d) => (
                <Card key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-app-text">{d.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-app-muted">{d.batchName}</span>
                      {d.puzzleCount !== null && (
                        <span className="text-app-muted">
                          {d.puzzleCount} {d.puzzleCount === 1 ? "puzzle" : "puzzles"}
                        </span>
                      )}
                      <DueBadge
                        completed={d.stats.total > 0 && d.stats.completed === d.stats.total}
                        dueDate={d.dueDate}
                        formatted={formatFullDate(d.dueDate, timeZone)}
                        timeZone={timeZone}
                      />
                      <span className="text-app-muted">
                        {d.stats.completed}/{d.stats.total} completed
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label={d.activityType === "PUZZLE_SET" ? "View results & leaderboard" : "View submissions"}
                      variant="outline"
                      size="icon"
                      className={iconBtn}
                      onClick={() => setSubmissionsFor(d.id)}
                    >
                      <Users className="size-4" strokeWidth={2.5} />
                    </Button>
                    <Button
                      aria-label="Withdraw assignment"
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                      onClick={() => runWithdraw(d)}
                    >
                      <Trash2 className="size-4" strokeWidth={2.5} />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AssignmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={editing ? "edit" : "create"}
        assignment={editing}
        coachBatches={batches}
        allowLibrarySource={false}
      />
      <DeployAssignmentDialog
        open={!!deploying}
        onOpenChange={(open) => !open && setDeploying(null)}
        assignment={deploying}
        coachBatches={batches}
      />
      <AssignmentPreviewDialog
        open={!!previewing}
        onOpenChange={(open) => !open && setPreviewing(null)}
        assignment={previewing}
      />
      <AssignmentSubmissionsDialog
        open={!!submissionsFor}
        onOpenChange={(open) => !open && setSubmissionsFor(null)}
        deploymentId={submissionsFor}
      />
    </div>
  );
}
