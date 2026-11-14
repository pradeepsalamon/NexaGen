"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, FolderTree, Loader2, Plus, Trash2 } from "lucide-react";
import type { KnowledgeCategoryDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { createKnowledgeCategory, deleteKnowledgeCategory, updateKnowledgeCategory } from "../../api/knowledgeApi";
import { useKnowledgeCategories } from "../../hooks/useKnowledgeApi";

/** Admin-defined groupings for the help centre (Platform help, Openings, Fees…). */
export function CategoriesPanel() {
  const categories = useKnowledgeCategories();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (body: { name: string; description: string }) =>
      createKnowledgeCategory({ description: body.description || null, name: body.name, sortOrder: (categories.data?.categories.length ?? 0) * 10 }),
    strategy: "immediate",
    toast: (body) => ({ title: `Category “${body.name}” added.` }),
    undo: (_body, created) => deleteKnowledgeCategory(created.id),
  });
  const setArchived = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (v: { c: KnowledgeCategoryDto; archived: boolean }) => updateKnowledgeCategory(v.c.id, { archived: v.archived }),
    strategy: "immediate",
    toast: (v) => ({ title: v.archived ? `“${v.c.name}” archived.` : `“${v.c.name}” restored.` }),
    undo: (v) => updateKnowledgeCategory(v.c.id, { archived: !v.archived }),
  });
  const remove = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (c: KnowledgeCategoryDto) => deleteKnowledgeCategory(c.id),
    strategy: "defer",
    toast: (c) => ({ title: `Category “${c.name}” deleted.` }),
    undo: async () => undefined,
  });

  const submit = async () => {
    if (!name.trim()) return;
    await create.run({ description: description.trim(), name: name.trim() });
    setName("");
    setDescription("");
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-end">
        <Input aria-label="Category name" maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Platform help" value={name} />
        <Input aria-label="Description" maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" value={description} />
        <Button disabled={!name.trim() || create.isPending} onClick={() => void submit()}>
          {create.isPending ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <Plus aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
          Add category
        </Button>
      </Card>
      {categories.isError ? (
        <WidgetError message="Categories could not be loaded." onRetry={() => void categories.refetch()} />
      ) : !categories.data ? (
        <Skeleton className="h-32" />
      ) : categories.data.categories.length === 0 ? (
        <EmptyState description="Categories group articles in the help centre." icon={FolderTree} title="No categories yet" />
      ) : (
        <ul className="space-y-2">
          {categories.data.categories.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {c.name} {c.archived && <Badge variant="secondary">Archived</Badge>}
                  </p>
                  {c.description && <p className="text-sm text-app-muted">{c.description}</p>}
                </div>
                <Badge variant="outline">{c.articleCount} article(s)</Badge>
                <RowActions
                  actions={[
                    c.archived
                      ? { icon: ArchiveRestore, label: "Restore", ariaLabel: `Restore ${c.name}`, onSelect: () => void setArchived.run({ archived: false, c }) }
                      : { icon: Archive, label: "Archive", ariaLabel: `Archive ${c.name}`, onSelect: () => void setArchived.run({ archived: true, c }), tone: "warning" },
                    {
                      ariaLabel: `Delete ${c.name}`,
                      disabled: c.articleCount > 0,
                      icon: Trash2,
                      label: c.articleCount > 0 ? "Move its articles first" : "Delete",
                      onSelect: () => void remove.run(c),
                      tone: "danger",
                    },
                  ]}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
