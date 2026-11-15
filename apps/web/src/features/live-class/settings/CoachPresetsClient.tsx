"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button onClick={() => setCreating(true)} type="button">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            New preset
          </Button>
        }
        description="Save reusable class settings once, then apply them in a click when you start a class."
        title="Class presets"
      />

      {isLoading ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-app" />
          <Skeleton className="h-40 rounded-app" />
        </div>
      ) : isError ? (
        <WidgetError message="Couldn't load your presets. Check your connection and try again." onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-app-text">My presets</h2>
            {mine.length === 0 ? (
              <Card>
                <EmptyState
                  description="Create a preset to reuse the same class setup without configuring it every time."
                  icon={SlidersHorizontal}
                  title="No presets yet"
                  variant="inline"
                />
              </Card>
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
              <h2 className="text-base font-semibold text-app-text">Shared presets</h2>
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
