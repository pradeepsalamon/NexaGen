"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useLiveClassPresets } from "./hooks";
import { PresetCard } from "./PresetCard";
import { PresetFormModal } from "./PresetFormModal";

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
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Class presets</h1>
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <WidgetError message="Couldn't load presets." onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-app-muted">My presets</h2>
            {mine.length === 0 ? (
              <EmptyState
                title="No presets yet"
                description="Create a preset to reuse the same class setup without configuring it every time."
              />
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                {mine.map((p) => (
                  <PresetCard key={p.id} preset={p} />
                ))}
              </div>
            )}
          </section>

          {shared.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-app-muted">
                Shared presets
              </h2>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
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
