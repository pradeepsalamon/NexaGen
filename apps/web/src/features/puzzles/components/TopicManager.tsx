"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildPuzzleTopicTree,
  collectPuzzleTopicSubtreeIds,
  flattenPuzzleTopicTree,
  folderHomeworkBlocker,
  isSystemPuzzleFolder,
  MAX_PUZZLE_TOPIC_DEPTH,
  puzzleTopicPath,
  type PuzzleTopicDto,
  type PuzzleTopicTreeNode
} from "@nexa-chess/types";
import {
  Archive,
  ChevronRight,
  ClipboardCheck,
  ClipboardPaste,
  Copy,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Scissors,
  ShieldCheck,
  ShieldOff,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
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
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import {
  approveFolderHomework,
  archivePuzzleTopic,
  copyPuzzleTopic,
  reassignPuzzleTopic,
  revokeFolderHomework,
  updatePuzzleTopic
} from "../api/puzzleApi";
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

export function TopicManager({
  canManage,
  onAssignFolder
}: {
  canManage: boolean;
  /** Coach: assign a homework-approved folder through the ordinary homework dialog. */
  onAssignFolder?: (topic: PuzzleTopicDto) => void;
}) {
  const { data, isLoading } = usePuzzleTopics();
  const toast = useToast();
  const createMut = useCreatePuzzleTopic();
  const updateMut = useUpdatePuzzleTopic();

  const [editing, setEditing] = useState<PuzzleTopicDto | null>(null);
  // `undefined` = dialog closed; `null` = new top-level folder.
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [reassigning, setReassigning] = useState<TopicNode | null>(null);
  // Folders start closed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [clipboard, setClipboard] = useState<{ mode: "copy" | "cut"; node: TopicNode } | null>(null);

  const topics = useMemo(() => data?.topics ?? [], [data]);
  const tree = useMemo(() => buildPuzzleTopicTree(topics), [topics]);
  const rows = useMemo(
    () => flattenPuzzleTopicTree(tree).filter((node) => isVisible(node, topics, expanded)),
    [tree, topics, expanded]
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

  const { run: runCopy } = useUndoableMutation({
    strategy: "defer",
    mutationFn: ({ node, parentId }: { node: TopicNode; parentId: string | null }) =>
      copyPuzzleTopic(node.topic.id, { parentId }),
    undo: async () => {},
    toast: ({ node }) => ({ title: `Copying "${node.topic.name}"${node.children.length ? " and its subfolders" : ""}` }),
    invalidates: [queryKeys.puzzles.topics, queryKeys.puzzles.all]
  });

  const { run: runMove } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ node, parentId }: { node: TopicNode; parentId: string | null }) =>
      updatePuzzleTopic(node.topic.id, { parentId }),
    undo: ({ node }) => updatePuzzleTopic(node.topic.id, { parentId: node.topic.parentId }),
    toast: ({ node }) => ({ title: `Moved "${node.topic.name}"` }),
    invalidates: [queryKeys.puzzles.topics, queryKeys.puzzles.all]
  });

  // Super Admin: academy-wide homework approval; each is the other's undo.
  const { run: runHomeworkApproval } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ topic, approve }: { topic: PuzzleTopicDto; approve: boolean }) =>
      approve ? approveFolderHomework(topic.id) : revokeFolderHomework(topic.id),
    undo: ({ topic, approve }) =>
      approve ? revokeFolderHomework(topic.id) : approveFolderHomework(topic.id),
    toast: ({ topic, approve }) => ({
      title: approve
        ? `"${topic.name}" approved for homework`
        : `Homework approval revoked for "${topic.name}"`,
      message: approve
        ? "Every coach in the academy can now assign this folder."
        : "Coaches can no longer assign this folder."
    }),
    invalidates: [queryKeys.puzzles.topics]
  });

  const paste = (parentId: string | null) => {
    if (!clipboard) return;
    if (clipboard.mode === "copy") void runCopy({ node: clipboard.node, parentId });
    else void runMove({ node: clipboard.node, parentId });
    setClipboard(null);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
  };

  // A folder can't be pasted into itself or anything inside it.
  const clipboardSubtree = useMemo(
    () => (clipboard ? new Set(collectPuzzleTopicSubtreeIds(topics, clipboard.node.topic.id)) : null),
    [clipboard, topics]
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
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
          {canManage ? "" : "Managed by admins."}{" "}
          {onAssignFolder
            ? "Folders the Super Admin has approved for homework can be assigned to your batches."
            : topics.some((t) => t.canApproveHomework)
              ? "Approve a folder for homework to let every coach assign it."
              : ""}
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreatingIn(null)}>
            <Plus className="mr-1.5 size-4" />
            New folder
          </Button>
        )}
      </div>

      {canManage && clipboard ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-app-text">
            {clipboard.mode === "copy" ? "Copied" : "Cut"} <strong>&quot;{clipboard.node.topic.name}&quot;</strong> — use a
            folder&apos;s paste button, or paste it at the top level.
          </span>
          <div className="flex items-center gap-2">
            {clipboard.mode === "copy" || clipboard.node.topic.parentId ? (
              <Button size="sm" variant="outline" onClick={() => paste(null)}>
                <ClipboardPaste className="mr-1.5 size-4" />
                Paste at top level
              </Button>
            ) : null}
            <SimpleTooltip label="Clear clipboard">
              <Button
                aria-label="Clear clipboard"
                size="icon"
                variant="ghost"
                className="size-8 rounded-full"
                onClick={() => setClipboard(null)}
              >
                <X className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          </div>
        </div>
      ) : null}

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
                <TableHead>Homework</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((node) => {
                const { topic } = node;
                const hasChildren = node.children.length > 0;
                const open = expanded.has(topic.id);
                const canPasteHere =
                  !!clipboard &&
                  !clipboardSubtree?.has(topic.id) &&
                  !(clipboard.mode === "cut" && clipboard.node.topic.parentId === topic.id);
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
                            className="size-4 shrink-0 fill-secondary/30 text-secondary-ink"
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
                    <TableCell>
                      <HomeworkCell
                        node={node}
                        onApprove={(approve) => runHomeworkApproval({ topic, approve })}
                        onAssign={onAssignFolder ? () => onAssignFolder(topic) : undefined}
                      />
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
                          {canPasteHere ? (
                            <SimpleTooltip label={`Paste "${clipboard!.node.topic.name}" here`}>
                              <Button
                                aria-label={`Paste into ${topic.name}`}
                                variant="outline"
                                size="icon"
                                className={cn(iconBtn, "border-primary text-primary-ink")}
                                onClick={() => paste(topic.id)}
                              >
                                <ClipboardPaste className="size-4" strokeWidth={2.5} />
                              </Button>
                            </SimpleTooltip>
                          ) : null}
                          <SimpleTooltip label="Copy folder">
                            <Button
                              aria-label={`Copy ${topic.name}`}
                              variant="outline"
                              size="icon"
                              className={iconBtn}
                              onClick={() => setClipboard({ mode: "copy", node })}
                            >
                              <Copy className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip label="Cut folder (to move it)">
                            <Button
                              aria-label={`Cut ${topic.name}`}
                              variant="outline"
                              size="icon"
                              className={iconBtn}
                              onClick={() => setClipboard({ mode: "cut", node })}
                            >
                              <Scissors className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
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

/**
 * A folder's homework state: approved or not (academy-wide), why an approved
 * folder can't be assigned right now, the coach's Assign button and the Super
 * Admin's approve / revoke switch.
 */
function HomeworkCell({
  node,
  onApprove,
  onAssign
}: {
  node: TopicNode;
  onApprove: (approve: boolean) => void;
  onAssign?: () => void;
}) {
  const timeZone = useUserTimeZone();
  const { topic } = node;
  const approved = topic.homeworkApprovedAt !== null;
  // What would stop it if it were approved — the same shared rule the API uses.
  const structuralBlocker = folderHomeworkBlocker({
    approved: true,
    isSystem: isSystemPuzzleFolder(topic),
    puzzleCount: topic.homeworkPuzzleCount,
    subfolderCount: node.children.length
  });
  const approvedBy = approved
    ? `Approved${topic.homeworkApprovedByName ? ` by ${topic.homeworkApprovedByName}` : ""} on ${formatFullDate(topic.homeworkApprovedAt, timeZone)}`
    : null;

  return (
    <div className="flex items-center gap-1.5">
      {approved ? (
        <SimpleTooltip label={topic.homeworkBlocker ? `${approvedBy}. ${topic.homeworkBlocker}` : approvedBy!}>
          <Badge variant={topic.homeworkBlocker ? "warning" : "success"} tabIndex={0}>
            {topic.homeworkBlocker ? "Approved · blocked" : "Approved"}
          </Badge>
        </SimpleTooltip>
      ) : (
        <span className="text-sm text-app-muted">—</span>
      )}

      {onAssign && approved && !topic.homeworkBlocker ? (
        <SimpleTooltip label={`Assign folder (${topic.homeworkPuzzleCount} puzzle${topic.homeworkPuzzleCount === 1 ? "" : "s"})`}>
          <Button
            aria-label={`Assign folder ${topic.name}`}
            variant="ghost"
            size="icon"
            className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
            onClick={onAssign}
          >
            <ClipboardCheck className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      ) : null}

      {topic.canApproveHomework ? (
        approved ? (
          <SimpleTooltip label="Revoke homework approval (academy-wide)">
            <Button
              aria-label={`Revoke homework approval for ${topic.name}`}
              variant="ghost"
              size="icon"
              className="size-8 rounded-full border border-secondary bg-secondary p-0 text-black shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:text-black"
              onClick={() => onApprove(false)}
            >
              <ShieldOff className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        ) : (
          <SimpleTooltip label={structuralBlocker ?? "Approve for homework (every coach)"}>
            {/* A disabled button gets no pointer events — the span keeps the tooltip. */}
            <span className="inline-flex">
              <Button
                aria-label={`Approve ${topic.name} for homework`}
                variant="ghost"
                size="icon"
                disabled={!!structuralBlocker}
                className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                onClick={() => onApprove(true)}
              >
                <ShieldCheck className="size-4" strokeWidth={2.5} />
              </Button>
            </span>
          </SimpleTooltip>
        )
      ) : null}
    </div>
  );
}

/** A row is shown only while every one of its ancestors is expanded. */
function isVisible(node: TopicNode, topics: PuzzleTopicDto[], expanded: Set<string>) {
  return puzzleTopicPath(topics, node.topic.id)
    .slice(0, -1)
    .every((ancestor) => expanded.has(ancestor.id));
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
