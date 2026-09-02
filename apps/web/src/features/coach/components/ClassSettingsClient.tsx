"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { ClassSettingsPanel } from "@/features/live-class/settings/ClassSettingsPanel";
import {
  useClassLiveSettings,
  useLiveClassPresets,
  useUpdateClassLiveSettings,
} from "@/features/live-class/settings/hooks";

export function ClassSettingsClient({ classId }: { classId: string }) {
  const { data, isLoading, isError, refetch } = useClassLiveSettings(classId);
  const { data: presetData } = useLiveClassPresets();
  const update = useUpdateClassLiveSettings(classId);

  const [override, setOverride] = useState<LiveClassSettingsOverride>({});

  useEffect(() => {
    if (data) setOverride(data.classOverride ?? {});
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return <WidgetError message="Couldn't load class settings." onRetry={() => refetch()} />;
  }

  const save = () =>
    update.mutate({
      liveClassSettings: Object.keys(override).length > 0 ? override : null,
    });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <BackButton />
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-app-text">Class settings</h1>
        <p className="mt-1 text-sm text-app-muted">
          How this class behaves before and while students are in it. Unset options inherit the
          batch default, then the platform default.
        </p>
      </div>

      {data.snapshot && (
        <div className="flex gap-2.5 rounded-control border border-app-border bg-app-soft/40 p-3 text-xs text-app-muted">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
          <span>
            This class has already started. The running session keeps the settings it began with —
            changes here apply to future sessions of this class.
          </span>
        </div>
      )}

      <ClassSettingsPanel
        system={data.system}
        batchOverride={data.batchOverride}
        value={override}
        onChange={setOverride}
        presets={presetData?.presets ?? []}
        disabled={!data.canEdit}
      />

      {data.canEdit && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOverride(data.classOverride ?? {})}
            disabled={update.isPending}
          >
            Reset
          </Button>
          <Button type="button" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
