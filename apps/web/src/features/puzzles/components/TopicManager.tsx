"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildPuzzleTopicTree,
  collectPuzzleTopicSubtreeIds,
  flattenPuzzleTopicTree,
  MAX_PUZZLE_TOPIC_DEPTH,
  puzzleTopicPath,
  type PuzzleTopicDto,
  type PuzzleTopicTreeNode
} from "@nexa-chess/types";
import { Archive, ChevronRight, Folder, FolderPlus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { archivePuzzleTopic, reassignPuzzleTopic } from "../api/puzzleApi";
import {
  useCreatePuzzleTopic,
  usePuzzleTopics,
  useUpdatePuzzleTopic
} from "../hooks/usePuzzlesApi";
import { puzzleTopicOptions } from "../lib/puzzleMeta";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

type TopicNode = PuzzleTopicTreeNode<PuzzleTopicDto>;
type TopicFormValues = {
  name: string;
  description?: string;
  icon?: string;
  parentId: string | null;
};

export function TopicManager({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = usePuzzleTopics();
  const toast = useToast();
  const createMut = useCreatePuzzleTopic();
  const updateMut = useUpdatePuzzleTopic();

  const [editing, setEditing] = useState<PuzzleTopicDto | null>(null);
  // `undefined` = dialog closed; `null` = new top-level folder.
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [reassigning, setReassigning] = useState<TopicNode | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const topics = useMemo(() => data?.topics ?? [], [data]);
  const tree = useMemo(() => buildPuzzleTopicTree(topics), [topics]);
  const rows = useMemo(
    () => flattenPuzzleTopicTree(tree).filter((node) => isVisible(node, topics, collapsed)),
    [tree, topics, collapsed]
  );

  const { run: runArchive } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (node: TopicNode) => archivePuzzleTopic(node.topic.id),
    undo: async () => {},
    toast: (node) => ({
      title: `Archiving "${node.topic.name}"${node.children.length ? " and its subfolders" : ""}`
    }),
    invalidates: [queryKeys.puzzles.topics, queryKeys.puzzles.all]
  });

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          Folders organise every puzzle and can hold subfolders.{" "}
          {canManage ? "" : "Managed by admins."}
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreatingIn(null)}>
            <Plus className="mr-1.5 size-4" />
            New folder
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No folders yet"
          description="Create folders like Tactics › Forks or Endgames › Rook endings to organise puzzles."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folder</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Puzzles</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((node) => {
                const { topic } = node;
                const hasChildren = node.children.length > 0;
                const open = !collapsed.has(topic.id);
                return (
                  <TableRow key={topic.id}>
                    <TableCell className="font-medium text-app-text">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${node.depth * 1.25}rem` }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            aria-label={open ? `Collapse ${topic.name}` : `Expand ${topic.name}`}
                            aria-expanded={open}
                            onClick={() => toggle(topic.id)}
                            className="grid size-6 shrink-0 place-items-center rounded-full text-app-muted hover:bg-app-soft hover:text-app-text"
                          >
                            <ChevronRight
                              className={cn("size-4 transition-transform", open && "rotate-90")}
                              strokeWidth={2.5}
                            />
                          </button>
                        ) : (
                          <span className="size-6 shrink-0" />
                        )}
                        {topic.icon ? (
                          <span className="shrink-0">{topic.icon}</span>
                        ) : (
                          <Folder
                            className="size-4 shrink-0 fill-amber-400/30 text-amber-500"
                            strokeWidth={2}
                          />
                        )}
                        <span className="truncate">{topic.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-app-muted">
                      {topic.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {topic.puzzleCount}
                      {node.totalPuzzleCount !== topic.puzzleCount ? (
                        <span className="text-app-muted"> ({node.totalPuzzleCount} total)</span>
                      ) : null}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {node.depth + 1 < MAX_PUZZLE_TOPIC_DEPTH ? (
                            <SimpleTooltip label="Add subfolder">
                              <Button
                                aria-label={`Add subfolder to ${topic.name}`}
                                variant="outline"
                                size="icon"
                                className={iconBtn}
                                onClick={() => setCreatingIn(topic.id)}
                              >
                                <FolderPlus className="size-4" strokeWidth={2.5} />
                              </Button>
                            </SimpleTooltip>
                          ) : null}
                          <SimpleTooltip label="Edit or move">
                            <Button
                              aria-label={`Edit ${topic.name}`}
                              variant="outline"
                              size="icon"
                              className={iconBtn}
                              onClick={() => setEditing(topic)}
                            >
                              <Pencil className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip
                            label={node.totalPuzzleCount > 0 ? "Reassign & archive" : "Archive"}
                          >
                            <Button
                              aria-label={`Archive ${topic.name}`}
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-full border border-secondary bg-secondary p-0 text-black shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:text-black"
                              onClick={() =>
                                node.totalPuzzleCount > 0 ? setReassigning(node) : runArchive(node)
                              }
                            >
                              <Archive className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canManage && (
        <TopicFormDialog
          key={editing?.id ?? `new-${creatingIn ?? "root"}`}
          open={creatingIn !== undefined || !!editing}
          topic={editing}
          topics={topics}
          defaultParentId={editing ? editing.parentId : (creatingIn ?? null)}
          onClose={() => {
            setCreatingIn(undefined);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            if (editing) {
              await updateMut.mutateAsync({ id: editing.id, data: values });
            } else {
              await createMut.mutateAsync(values);
            }
          }}
        />
      )}

      {reassigning && (
        <ReassignDialog
          node={reassigning}
          topics={topics}
          onClose={() => setReassigning(null)}
          onDone={(moved) => {
            toast.success({
              title: `Moved ${moved} puzzle${moved === 1 ? "" : "s"} and archived "${reassigning.topic.name}"`
            });
            setReassigning(null);
          }}
        />
      )}
    </Card>
  );
}

/** A row is shown only while none of its ancestors is collapsed. */
function isVisible(node: TopicNode, topics: PuzzleTopicDto[], collapsed: Set<string>) {
  return puzzleTopicPath(topics, node.topic.id)
    .slice(0, -1)
    .every((ancestor) => !collapsed.has(ancestor.id));
}

function TopicFormDialog({
  open,
  topic,
  topics,
  defaultParentId,
  onClose,
  onSubmit
}: {
  open: boolean;
  topic: PuzzleTopicDto | null;
  topics: PuzzleTopicDto[];
  defaultParentId: string | null;
  onClose: () => void;
  onSubmit: (values: TopicFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [icon, setIcon] = useState(topic?.icon ?? "");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [busy, setBusy] = useState(false);

  // A folder can't move into itself or below itself.
  const parentOptions = useMemo(
    () =>
      puzzleTopicOptions(
        topics,
        new Set(topic ? collectPuzzleTopicSubtreeIds(topics, topic.id) : [])
      ),
    [topics, topic]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{topic ? "Edit folder" : "New folder"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="topic-name" label="Name">
            <Input
              id="topic-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField id="topic-parent" label="Inside folder">
            <Select
              id="topic-parent"
              value={parentId}
              placeholder="Top level"
              options={parentOptions}
              onChange={(e) => setParentId(e.target.value)}
            />
          </FormField>
          <FormField id="topic-icon" label="Icon (emoji, optional)">
            <Input
              id="topic-icon"
              value={icon}
              maxLength={4}
              onChange={(e) => setIcon(e.target.value)}
            />
          </FormField>
          <FormField id="topic-desc" label="Description">
            <Textarea
              id="topic-desc"
              value={description}
              rows={2}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  icon: icon.trim() || undefined,
                  parentId: parentId || null
                });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {topic ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  node,
  topics,
  onClose,
  onDone
}: {
  node: TopicNode;
  topics: PuzzleTopicDto[];
  onClose: () => void;
  onDone: (moved: number) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [toTopicId, setToTopicId] = useState("");
  const [busy, setBusy] = useState(false);
  const { topic, totalPuzzleCount } = node;
  const destinations = useMemo(
    () => puzzleTopicOptions(topics, new Set(collectPuzzleTopicSubtreeIds(topics, topic.id))),
    [topics, topic.id]
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive &quot;{topic.name}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-app-muted">
          {node.children.length ? "This folder and its subfolders hold" : "This folder holds"}{" "}
          {totalPuzzleCount} puzzle{totalPuzzleCount === 1 ? "" : "s"}. Move them to another folder
          first{node.children.length ? "; the subfolders are archived too" : ""}.
        </p>
        <FormField id="reassign-to" label="Move puzzles to">
          <Select
            id="reassign-to"
            value={toTopicId}
            placeholder="Select a folder"
            options={destinations}
            onChange={(e) => setToTopicId(e.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !toTopicId}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await reassignPuzzleTopic(topic.id, { toTopicId });
                void queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.topics });
                void queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all });
                onDone(res.moved);
              } catch (error) {
                toast.error({
                  title: "Could not reassign",
                  message: (error as Error).message
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Move &amp; archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
