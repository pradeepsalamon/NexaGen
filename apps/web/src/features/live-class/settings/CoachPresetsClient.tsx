"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { resolveLiveClassSettings, type LiveClassPreset } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useToast } from "@/providers/ToastProvider";
import { cn } from "@/lib/utils";
import { summaryRows } from "./fields";
import {
  useDeleteLiveClassPreset,
  useDuplicateLiveClassPreset,
  useLiveClassPresets,
  useSetDefaultLiveClassPreset,
} from "./hooks";
import { PresetFormModal } from "./PresetFormModal";

const ICON_BTN =
  "grid size-8 shrink-0 place-items-center rounded-full border border-app-border text-app-muted transition-colors hover:bg-app-soft hover:text-app-text disabled:opacity-40";

function PresetCard({ preset }: { preset: LiveClassPreset }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const duplicate = useDuplicateLiveClassPreset();
  const remove = useDeleteLiveClassPreset();
  const setDefault = useSetDefaultLiveClassPreset();

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
              <button
                type="button"
                aria-label={preset.isDefault ? "Default preset" : "Set as default"}
                className={cn(ICON_BTN, preset.isDefault && "border-emerald-400 text-emerald-500")}
                disabled={setDefault.isPending || preset.isDefault}
                onClick={() => setDefault.mutate(preset.id)}
              >
                <Star
                  className="size-4"
                  strokeWidth={2.5}
                  fill={preset.isDefault ? "currentColor" : "none"}
                />
              </button>
            </SimpleTooltip>
          )}
          <SimpleTooltip label="Duplicate">
            <button
              type="button"
              aria-label="Duplicate preset"
              className={ICON_BTN}
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate(preset.id)}
            >
              <Copy className="size-4" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
          {preset.canManage && (
            <SimpleTooltip label="Edit">
              <button
                type="button"
                aria-label="Edit preset"
                className={ICON_BTN}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
          )}
          {preset.canManage && !preset.isSystem && (
            <SimpleTooltip label="Delete">
              <button
                type="button"
                aria-label="Delete preset"
                className={cn(ICON_BTN, "hover:border-app-danger hover:bg-app-danger hover:text-white")}
                disabled={remove.isPending}
                onClick={() =>
                  toast.undoable({
                    title: `Deleting "${preset.name}"`,
                    onCommit: () => remove.mutate(preset.id),
                  })
                }
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
          )}
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <dt className="text-app-muted">{r.label}</dt>
            <dd className="text-right font-semibold text-app-text">{r.value}</dd>
          </div>
        ))}
      </dl>

      {editing && (
        <PresetFormModal open={editing} onOpenChange={setEditing} preset={preset} />
      )}
    </Card>
  );
}

export function CoachPresetsClient() {
  const { data, isLoading, isError, refetch } = useLiveClassPresets();
  const [creating, setCreating] = useState(false);

  const presets = data?.presets ?? [];
  const mine = presets.filter((p) => !p.isSystem && p.scope === "PERSONAL");
  const shared = presets.filter((p) => p.isSystem || p.scope === "ORG");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">Class Presets</h1>
          <p className="mt-1 text-sm text-app-muted">
            Save reusable class settings once, then apply them in a click when you start a class.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
          New preset
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <WidgetError message="Couldn't load presets." onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-app-muted">My presets</h2>
            {mine.length === 0 ? (
              <EmptyState
                title="No presets yet"
                description="Create a preset to reuse the same class setup without configuring it every time."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {mine.map((p) => (
                  <PresetCard key={p.id} preset={p} />
                ))}
              </div>
            )}
          </section>

          {shared.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-app-muted">
                Shared presets
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {shared.map((p) => (
                  <PresetCard key={p.id} preset={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {creating && <PresetFormModal open={creating} onOpenChange={setCreating} preset={null} />}
    </div>
  );
}
