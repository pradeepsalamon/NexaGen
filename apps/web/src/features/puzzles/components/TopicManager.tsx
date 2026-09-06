"use client";

import { useState } from "react";
import type { PuzzleTopicDto } from "@nexa-chess/types";
import { Archive, Pencil, Plus } from "lucide-react";
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
import { useToast } from "@/providers/ToastProvider";
import { archivePuzzleTopic, reassignPuzzleTopic } from "../api/puzzleApi";
import {
  useCreatePuzzleTopic,
  usePuzzleTopics,
  useUpdatePuzzleTopic
} from "../hooks/usePuzzlesApi";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

export function TopicManager({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = usePuzzleTopics();
  const toast = useToast();
  const createMut = useCreatePuzzleTopic();
  const updateMut = useUpdatePuzzleTopic();

  const [editing, setEditing] = useState<PuzzleTopicDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState<PuzzleTopicDto | null>(null);

  const { run: runArchive } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (topic: PuzzleTopicDto) => archivePuzzleTopic(topic.id),
    undo: async () => {},
    toast: (topic) => ({ title: `Archiving "${topic.name}"` }),
    invalidates: [queryKeys.puzzles.topics, queryKeys.puzzles.all]
  });

  const topics = data?.topics ?? [];

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-app-muted">
          Topics organise every puzzle. {canManage ? "" : "Managed by admins."}
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 size-4" />
            New topic
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
          title="No topics yet"
          description="Create topics like Fork, Pin or Checkmate in 2 to organise puzzles."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Puzzles</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium text-app-text">
                    {topic.icon ? <span className="mr-1.5">{topic.icon}</span> : null}
                    {topic.name}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-app-muted">
                    {topic.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{topic.puzzleCount}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <SimpleTooltip label="Edit">
                          <Button
                            aria-label="Edit topic"
                            variant="outline"
                            size="icon"
                            className={iconBtn}
                            onClick={() => setEditing(topic)}
                          >
                            <Pencil className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip label={topic.puzzleCount > 0 ? "Reassign & archive" : "Archive"}>
                          <Button
                            aria-label="Archive topic"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:bg-secondary hover:text-black"
                            onClick={() =>
                              topic.puzzleCount > 0 ? setReassigning(topic) : runArchive(topic)
                            }
                          >
                            <Archive className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canManage && (
        <TopicFormDialog
          key={editing?.id ?? "new"}
          open={creating || !!editing}
          topic={editing}
          onClose={() => {
            setCreating(false);
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
          topic={reassigning}
          others={topics.filter((t) => t.id !== reassigning.id)}
          onClose={() => setReassigning(null)}
          onDone={(moved) => {
            toast.success({
              title: `Moved ${moved} puzzle${moved === 1 ? "" : "s"} and archived "${reassigning.name}"`
            });
            setReassigning(null);
          }}
        />
      )}
    </Card>
  );
}

function TopicFormDialog({
  open,
  topic,
  onClose,
  onSubmit
}: {
  open: boolean;
  topic: PuzzleTopicDto | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description?: string; icon?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [icon, setIcon] = useState(topic?.icon ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{topic ? "Edit topic" : "New topic"}</DialogTitle>
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>
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
                  icon: icon.trim() || undefined
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
  topic,
  others,
  onClose,
  onDone
}: {
  topic: PuzzleTopicDto;
  others: PuzzleTopicDto[];
  onClose: () => void;
  onDone: (moved: number) => void;
}) {
  const toast = useToast();
  const [toTopicId, setToTopicId] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive &quot;{topic.name}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-app-muted">
          This topic has {topic.puzzleCount} puzzle{topic.puzzleCount === 1 ? "" : "s"}. Move them
          to another topic first.
        </p>
        <FormField id="reassign-to" label="Move puzzles to">
          <Select
            id="reassign-to"
            value={toTopicId}
            placeholder="Select a topic"
            options={others.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => setToTopicId(e.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !toTopicId}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await reassignPuzzleTopic(topic.id, { toTopicId });
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
