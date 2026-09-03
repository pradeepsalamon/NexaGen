"use client";

import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  liveClassSettingsSchema,
  type LiveClassSettings,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { LiveClassAuditLog } from "./LiveClassAuditLog";
import { LiveClassSettingsForm } from "./LiveClassSettingsForm";
import { PresetCard } from "./PresetCard";
import { PresetFormModal } from "./PresetFormModal";
import { useLiveClassPolicy, useLiveClassPresets, useUpdateLiveClassPolicy } from "./hooks";

function SystemPolicySection() {
  const { data, isLoading, isError, refetch } = useLiveClassPolicy();
  const update = useUpdateLiveClassPolicy();

  const [settings, setSettings] = useState<LiveClassSettings>(DEFAULT_LIVE_CLASS_SETTINGS);
  useEffect(() => {
    if (data) setSettings(data.settings);
  }, [data]);

  const dirty = data ? JSON.stringify(settings) !== JSON.stringify(data.settings) : false;

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-app-text">Platform defaults</h2>
        <p className="mt-1 text-sm text-app-muted">
          The baseline every batch, class and preset inherits from. Batches and coaches can still
          override individual options.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : isError || !data ? (
        <WidgetError message="Couldn't load platform defaults." onRetry={() => refetch()} />
      ) : (
        <>
          <LiveClassSettingsForm
            scope="system"
            override={settings}
            onOverrideChange={(next) => setSettings(liveClassSettingsSchema.parse(next))}
            resolved={settings}
            inheritedFrom={DEFAULT_LIVE_CLASS_SETTINGS}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettings(data.settings)}
              disabled={update.isPending || !dirty}
            >
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => update.mutate({ settings })}
              disabled={update.isPending || !dirty}
            >
              {update.isPending ? "Saving…" : "Save defaults"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function OrgPresetsSection() {
  const { data, isLoading, isError, refetch } = useLiveClassPresets();
  const [creating, setCreating] = useState(false);

  const orgPresets = (data?.presets ?? []).filter((p) => p.scope === "ORG" || p.isSystem);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-app-text">Organisation presets</h2>
          <p className="mt-1 text-sm text-app-muted">
            Reusable class setups every coach can pick from when starting a class.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
          New organisation preset
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <WidgetError message="Couldn't load presets." onRetry={() => refetch()} />
      ) : orgPresets.length === 0 ? (
        <EmptyState
          title="No organisation presets"
          description="Create one to give every coach a ready-made class configuration."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgPresets.map((p) => (
            <PresetCard key={p.id} preset={p} />
          ))}
        </div>
      )}

      {creating && (
        <PresetFormModal open={creating} onOpenChange={setCreating} preset={null} scope="ORG" />
      )}
    </section>
  );
}

export function AdminLiveClassSettingsClient() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-2.5">
        <SlidersHorizontal className="size-6 text-primary" strokeWidth={2.5} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">
            Live class settings
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            Platform-wide defaults and shared presets for live classes.
          </p>
        </div>
      </div>

      <SystemPolicySection />
      <OrgPresetsSection />
      <LiveClassAuditLog />
    </div>
  );
}
