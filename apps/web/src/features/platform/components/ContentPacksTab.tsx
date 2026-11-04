"use client";

import { FolderPlus, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ContentPackSummary } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePuzzleTopics } from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  useAddPlatformContentPackItem,
  useCreatePlatformContentPack,
  usePlatformContentPacks,
  useRemovePlatformContentPackItem,
  useUpdatePlatformContentPack
} from "../hooks/usePlatformApi";

function PackDialog({ onClose, pack }: { onClose: () => void; pack: ContentPackSummary | null }) {
  const create = useCreatePlatformContentPack();
  const update = useUpdatePlatformContentPack();
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [isPublished, setIsPublished] = useState(pack?.isPublished ?? false);
  const body = { description: description.trim() || null, isPublished, name: name.trim() };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pack ? `Edit ${pack.name}` : "New content pack"}</DialogTitle>
          <DialogDescription>
            Academies whose plan (or deal) includes a published pack can read its folders and copy them into their own
            library.
          </DialogDescription>
        </DialogHeader>
        <FormField id="pack-name" label="Name" required>
          <Input id="pack-name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <FormField id="pack-description" label="Description">
          <Textarea id="pack-description" onChange={(event) => setDescription(event.target.value)} rows={3} value={description} />
        </FormField>
        <Switch checked={isPublished} id="pack-published" label="Published" onCheckedChange={setIsPublished} />
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={body.name.length < 2}
            isLoading={create.isPending || update.isPending}
            onClick={() => {
              (pack ? update.mutateAsync({ body, id: pack.id }) : create.mutateAsync(body)).then(onClose, () => undefined);
            }}
            type="button"
          >
            {pack ? "Save" : "Create pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFolderDialog({ onClose, pack }: { onClose: () => void; pack: ContentPackSummary }) {
  const topics = usePuzzleTopics();
  const add = useAddPlatformContentPackItem();
  const [sourceId, setSourceId] = useState("");
  const taken = new Set(pack.items.map((item) => item.sourceId));
  const options = (topics.data?.topics ?? [])
    .filter((topic) => !taken.has(topic.id))
    .map((topic) => ({ label: `${topic.name} (${topic.puzzleCount})`, value: topic.id }));

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a folder to {pack.name}</DialogTitle>
          <DialogDescription>
            A Nexa puzzle folder. Academies see only its published, academy-wide puzzles, never private ones.
          </DialogDescription>
        </DialogHeader>
        <FormField id="pack-folder" label="Folder" required>
          <Select
            disabled={topics.isLoading}
            id="pack-folder"
            onChange={(event) => setSourceId(event.target.value)}
            options={options}
            placeholder={topics.isLoading ? "Loading folders…" : "Choose a folder"}
            value={sourceId}
          />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!sourceId}
            isLoading={add.isPending}
            onClick={() => {
              add.mutateAsync({ body: { kind: "PUZZLE_FOLDER", sourceId }, id: pack.id }).then(onClose, () => undefined);
            }}
            type="button"
          >
            Add folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContentPacksTab() {
  const packs = usePlatformContentPacks();
  const removeItem = useRemovePlatformContentPackItem();
  const [editing, setEditing] = useState<ContentPackSummary | "new" | null>(null);
  const [addingTo, setAddingTo] = useState<ContentPackSummary | null>(null);

  if (packs.isError) return <WidgetError message="Could not load content packs." onRetry={() => void packs.refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-app-muted">
          Include a pack in a plan, or add it to one academy&apos;s deal, from the academy page.
        </p>
        <Button className="ml-auto" onClick={() => setEditing("new")} type="button">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New pack
        </Button>
      </div>

      {packs.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (packs.data?.packs ?? []).length === 0 ? (
        <EmptyState description="Bundle Nexa puzzle folders for academies to copy." icon={Package} title="No content packs" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(packs.data?.packs ?? []).map((pack) => (
            <section className="rounded-panel border border-app-border bg-app-surface p-4 shadow-card" key={pack.id}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-app-text">{pack.name}</h3>
                    <Badge variant={pack.isPublished ? "success" : "secondary"}>
                      {pack.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  {pack.description ? <p className="mt-1 text-sm text-app-muted">{pack.description}</p> : null}
                  <p className="mt-1 break-all text-xs text-app-muted">Id: {pack.id}</p>
                </div>
                <RowActions
                  actions={[
                    { ariaLabel: `Edit ${pack.name}`, icon: Pencil, label: "Edit", onSelect: () => setEditing(pack) },
                    {
                      ariaLabel: `Add a folder to ${pack.name}`,
                      icon: FolderPlus,
                      label: "Add folder",
                      onSelect: () => setAddingTo(pack)
                    }
                  ]}
                />
              </div>
              {pack.items.length === 0 ? (
                <p className="mt-3 text-sm text-app-muted">No folders yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-app-border rounded-app border border-app-border">
                  {pack.items.map((item) => (
                    <li className="flex items-center gap-3 px-3 py-2" key={item.id}>
                      <span className="min-w-0 flex-1 truncate text-sm text-app-text">{item.title}</span>
                      <span className="text-xs text-app-muted">{item.puzzleCount} puzzles</span>
                      <RowActions
                        actions={[
                          {
                            ariaLabel: `Remove ${item.title} from ${pack.name}`,
                            icon: Trash2,
                            label: "Remove",
                            onSelect: () => removeItem.mutate({ id: pack.id, itemId: item.id }),
                            tone: "danger"
                          }
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {editing ? <PackDialog onClose={() => setEditing(null)} pack={editing === "new" ? null : editing} /> : null}
      {addingTo ? <AddFolderDialog onClose={() => setAddingTo(null)} pack={addingTo} /> : null}
    </div>
  );
}
