"use client";

import { useState } from "react";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";
import { resolveLiveClassSettings, type LiveClassPreset } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { summaryRows } from "./fields";
import { useSetDefaultLiveClassPreset } from "./hooks";
import { deleteLiveClassPreset, duplicateLiveClassPreset } from "./api";
import { PresetFormModal } from "./PresetFormModal";

export function PresetCard({ preset }: { preset: LiveClassPreset }) {
  const [editing, setEditing] = useState(false);
  const setDefault = useSetDefaultLiveClassPreset();

  const { run: runDuplicate, isPending: isDuplicating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => duplicateLiveClassPreset(id),
    undo: (_vars, result) => deleteLiveClassPreset(result.id),
    toast: () => ({ title: "Preset duplicated" }),
    invalidates: [queryKeys.liveClassPresets.all]
  });

  const { run: runDelete, isPending: isDeleting } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (id: string) => deleteLiveClassPreset(id),
    undo: async () => {},
    toast: () => ({ title: `Deleting "${preset.name}"` }),
    invalidates: [queryKeys.liveClassPresets.all]
  });

  const actions: RowAction[] = [];
  if (preset.canManage && !preset.isSystem && !preset.isDefault) {
    actions.push({
      ariaLabel: "Set as default",
      disabled: setDefault.isPending,
      icon: Star,
      label: "Set as default",
      onSelect: () => setDefault.mutate(preset.id)
    });
  }
  actions.push({
    ariaLabel: "Duplicate preset",
    disabled: isDuplicating,
    icon: Copy,
    label: "Duplicate",
    onSelect: () => runDuplicate(preset.id)
  });
  if (preset.canManage) {
    actions.push({ ariaLabel: "Edit preset", icon: Pencil, label: "Edit", onSelect: () => setEditing(true) });
  }
  if (preset.canManage && !preset.isSystem) {
    actions.push({
      ariaLabel: "Delete preset",
      disabled: isDeleting,
      icon: Trash2,
      label: "Delete",
      onSelect: () => runDelete(preset.id),
      tone: "danger"
    });
  }

  const resolved = resolveLiveClassSettings({ system: {}, class: preset.settings });
  const rows = summaryRows(resolved).slice(0, 4);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words font-semibold text-app-text">{preset.name}</h3>
            {preset.isDefault && (
              <Badge variant="success">
                Default
              </Badge>
            )}
            {preset.isSystem ? (
              <Badge variant="outline">
                System
              </Badge>
            ) : preset.scope === "ORG" ? (
              <Badge variant="outline">
                Organisation
              </Badge>
            ) : null}
          </div>
          {preset.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-app-muted">{preset.description}</p>
          )}
        </div>

        <div className="shrink-0">
          <RowActions actions={actions} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <dt className="text-app-muted">{r.label}</dt>
            <dd className="text-right font-semibold text-app-text">{r.value}</dd>
          </div>
        ))}
      </dl>

      {editing && (
        <PresetFormModal
          open={editing}
          onOpenChange={setEditing}
          preset={preset}
          scope={preset.scope}
        />
      )}
    </Card>
  );
}
