"use client";

import { useEffect, useMemo, useState } from "react";
import { RadioTower } from "lucide-react";
import {
  liveClassLockSources,
  resolveLiveClassSettings,
  withoutLockedFields,
  type LiveClassSettingsOverride,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { LiveClassSettingsForm } from "./LiveClassSettingsForm";
import { useClassLiveSettings, useUpdateLiveSettingsMidClass } from "./hooks";
import { useMemberClassId } from "../providers/LiveRoomContext";

/**
 * Coach-only panel for changing class settings while the class is running.
 * Applies through `PUT /live-class/:id/live-settings`, which re-pushes LiveKit
 * grants to everyone in the room and broadcasts the new config.
 */
export function InRoomClassControls() {
  const classId = useMemberClassId();

  const { data, isLoading, isError, refetch } = useClassLiveSettings(classId);
  const apply = useUpdateLiveSettingsMidClass(classId);

  const [draft, setDraft] = useState<LiveClassSettingsOverride>({});
  useEffect(() => {
    if (data) setDraft(data.classOverride ?? {});
  }, [data]);

  const inheritedFrom = useMemo(
    () =>
      data
        ? resolveLiveClassSettings({
            system: data.system,
            batch: data.batchOverride,
            systemLocks: data.systemLocks,
            batchLocks: data.batchLocks,
          })
        : undefined,
    [data],
  );

  const resolvedWithDraft = useMemo(
    () =>
      data
        ? resolveLiveClassSettings({
            system: data.system,
            batch: data.batchOverride,
            class: draft,
            systemLocks: data.systemLocks,
            batchLocks: data.batchLocks,
          })
        : undefined,
    [data, draft],
  );
  const lockSources = useMemo(
    () =>
      data ? liveClassLockSources({ systemLocks: data.systemLocks, batchLocks: data.batchLocks }) : {},
    [data],
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(data?.classOverride ?? {});

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (isError || !data || !inheritedFrom || !resolvedWithDraft) {
    return <WidgetError message="Couldn't load class settings." onRetry={() => refetch()} />;
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex gap-2.5 rounded-control border border-app-border bg-app-soft/40 p-3 text-xs leading-snug text-app-muted">
        <RadioTower className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
        <span>
          Changes apply immediately — participants&apos; controls lock or unlock without
          rejoining.
        </span>
      </div>

      <LiveClassSettingsForm
        scope="class"
        layout="stacked"
        showAdvanced={false}
        override={draft}
        onOverrideChange={setDraft}
        resolved={resolvedWithDraft}
        inheritedFrom={inheritedFrom}
        batchOverride={data.batchOverride}
        disabled={apply.isPending}
        lockSources={lockSources}
      />

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDraft(data.classOverride ?? {})}
          disabled={apply.isPending || !dirty}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => {
            const unlocked = withoutLockedFields(draft, [...data.systemLocks, ...data.batchLocks]) ?? {};
            apply.mutate({
              liveClassSettings: Object.keys(unlocked).length > 0 ? unlocked : null,
            });
          }}
          disabled={apply.isPending || !dirty}
        >
          {apply.isPending ? "Applying…" : "Apply to class"}
        </Button>
      </div>
    </div>
  );
}
