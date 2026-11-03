"use client";

import { useState } from "react";
import type { AssignmentDeployment, AssignmentLibraryItem } from "@nexa-chess/types";
import { BookOpen, Eye, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
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
import { ACTIVITY_ICON, ACTIVITY_LABEL, DIFFICULTY_LABEL, DueBadge } from "./assignmentBadges";
import { AssignmentOverviewPanel } from "./reminders/AssignmentOverviewPanel";

function RowSkeletons() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 rounded-app" />
      <Skeleton className="h-16 rounded-app" />
      <Skeleton className="h-16 rounded-app" />
    </div>
  );
}

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
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            New assignment
          </Button>
        }
        description="Build PGN assignments and send them to your batches with a due date."
        title="Assignments"
      />

      <Tabs defaultValue="library">
        <TabsList aria-label="Assignments view">
          <TabsTrigger value="library">Library ({library.length})</TabsTrigger>
          <TabsTrigger value="assigned">Assigned ({deployments.length})</TabsTrigger>
          <TabsTrigger value="due">Due dates</TabsTrigger>
        </TabsList>

        <TabsContent value="due">
          <AssignmentOverviewPanel />
        </TabsContent>

        <TabsContent value="library">
          {libraryLoading ? (
            <RowSkeletons />
          ) : library.length === 0 ? (
            <EmptyState
              action={{ label: "New assignment", onClick: openCreate }}
              description="Create your first PGN assignment, or wait for an admin to add shared ones."
              icon={BookOpen}
              title="No assignments yet"
            />
          ) : (
            <SectionCard description="Yours and the academy's shared ones." title="Library">
              <ul className="divide-y divide-app-border">
                {library.map((item) => {
                  const Icon = ACTIVITY_ICON[item.activityType];
                  const meta = [
                    ACTIVITY_LABEL[item.activityType],
                    DIFFICULTY_LABEL[item.difficulty],
                    item.puzzles ? `${item.puzzles.length} ${item.puzzles.length === 1 ? "puzzle" : "puzzles"}` : null,
                    `${item.deploymentCount} ${item.deploymentCount === 1 ? "deployment" : "deployments"}`
                  ];
                  const actions: RowAction[] = [
                    { ariaLabel: "Preview", icon: Eye, label: "Preview", onSelect: () => setPreviewing(item) }
                  ];
                  if (item.canManage) {
                    actions.push(
                      { ariaLabel: "Edit assignment", icon: Pencil, label: "Edit", onSelect: () => openEdit(item) },
                      {
                        ariaLabel: "Delete assignment",
                        icon: Trash2,
                        label: "Delete",
                        onSelect: () => runDelete(item),
                        tone: "danger"
                      }
                    );
                  }
                  return (
                    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" key={item.id}>
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-muted">
                        <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            className="min-w-0 break-words rounded-control text-left text-sm font-semibold text-app-text hover:text-primary-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                            onClick={() => setPreviewing(item)}
                            type="button"
                          >
                            {item.title}
                          </button>
                          {item.isLibrary ? (
                            <Badge variant="outline">
                              Shared{item.createdByName ? ` · ${item.createdByName}` : ""}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-app-muted">{meta.filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                        <Button
                          disabled={batches.length === 0}
                          onClick={() => setDeploying(item)}
                          size="sm"
                          variant="outline"
                        >
                          <Send aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                          Assign
                        </Button>
                        <RowActions actions={actions} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="assigned">
          {deploymentsLoading ? (
            <RowSkeletons />
          ) : deployments.length === 0 ? (
            <EmptyState
              description="Pick an assignment from the Library tab and send it to a batch."
              icon={Send}
              title="Nothing assigned yet"
            />
          ) : (
            <SectionCard description="Newest first, with how many students have finished." title="Assigned to batches">
              <ul className="divide-y divide-app-border">
                {deployments.map((d) => {
                  const Icon = ACTIVITY_ICON[d.activityType];
                  const allDone = d.stats.total > 0 && d.stats.completed === d.stats.total;
                  const meta = [
                    d.batchName,
                    d.puzzleCount !== null ? `${d.puzzleCount} ${d.puzzleCount === 1 ? "puzzle" : "puzzles"}` : null,
                    `${d.stats.completed} of ${d.stats.total} completed`
                  ];
                  const isSet = d.activityType === "PUZZLE_SET";
                  return (
                    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" key={d.id}>
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-muted">
                        <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 break-words text-sm font-semibold text-app-text">{d.title}</span>
                          <DueBadge
                            completed={allDone}
                            dueDate={d.dueDate}
                            formatted={formatFullDate(d.dueDate, timeZone)}
                            timeZone={timeZone}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-app-muted">{meta.filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                        <Button
                          aria-label={isSet ? "View results & leaderboard" : "View submissions"}
                          onClick={() => setSubmissionsFor(d.id)}
                          size="sm"
                          variant="outline"
                        >
                          <Users aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                          {isSet ? "Results" : "Submissions"}
                        </Button>
                        <RowActions
                          actions={[
                            {
                              ariaLabel: "Withdraw assignment",
                              icon: Trash2,
                              label: "Withdraw",
                              onSelect: () => runWithdraw(d),
                              tone: "danger"
                            }
                          ]}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
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
