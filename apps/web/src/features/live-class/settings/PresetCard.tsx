"use client";

import { useState } from "react";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";
import { resolveLiveClassSettings, type LiveClassPreset } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
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

  const resolved = resolveLiveClassSettings({ system: {}, class: preset.settings });
  const rows = summaryRows(resolved).slice(0, 4);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-app-text">{preset.name}</h3>
            {preset.isDefault && (
              <Badge variant="success" className="py-0.5 text-[10px]">
                Default
              </Badge>
            )}
            {preset.isSystem ? (
              <Badge variant="outline" className="py-0.5 text-[10px]">
                System
              </Badge>
            ) : preset.scope === "ORG" ? (
              <Badge variant="outline" className="py-0.5 text-[10px]">
                Organisation
              </Badge>
            ) : null}
          </div>
          {preset.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-app-muted">{preset.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {preset.canManage && !preset.isSystem && (
            <SimpleTooltip label={preset.isDefault ? "Default preset" : "Set as default"}>
              <Button
                aria-label={preset.isDefault ? "Default preset" : "Set as default"}
                variant="outline"
                size="icon"
                className={cn(
                  "size-8 rounded-full p-0 text-app-text transition-colors",
                  preset.isDefault
                    ? "border-success text-success-ink"
                    : "border-secondary hover:border-secondary hover:bg-secondary hover:text-black"
                )}
                disabled={setDefault.isPending || preset.isDefault}
                onClick={() => setDefault.mutate(preset.id)}
              >
                <Star
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={2.5}
                  fill={preset.isDefault ? "currentColor" : "none"}
                />
              </Button>
            </SimpleTooltip>
          )}
          <SimpleTooltip label="Duplicate">
            <Button
              aria-label="Duplicate preset"
              variant="ghost"
              size="icon"
              className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
              disabled={isDuplicating}
              onClick={() => runDuplicate(preset.id)}
            >
              <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
          {preset.canManage && (
            <SimpleTooltip label="Edit">
              <Button
                aria-label="Edit preset"
                variant="ghost"
                size="icon"
                className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          )}
          {preset.canManage && !preset.isSystem && (
            <SimpleTooltip label="Delete">
              <Button
                aria-label="Delete preset"
                variant="ghost"
                size="icon"
                className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                disabled={isDeleting}
                onClick={() => runDelete(preset.id)}
              >
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          )}
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
