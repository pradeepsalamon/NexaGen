"use client";

import { useEffect, useState } from "react";
import {
  liveClassLockSources,
  resolveLiveClassSettings,
  type LiveClassSettingsOverride,
  type LockableLiveSetting,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { LiveClassSettingsForm } from "./LiveClassSettingsForm";
import { useBatchLiveClassSettings, useUpdateBatchLiveClassSettings } from "./hooks";

/**
 * Batch-level live-class defaults (layer 3). Every class in the batch inherits
 * these unless the coach overrides them per class. Editable by admins only; the
 * API returns `canEdit: false` for everyone else and the form is read-only.
 */
export function BatchLiveClassSettingsTab({ batchId }: { batchId: string }) {
  const { data, isLoading, isError, refetch } = useBatchLiveClassSettings(batchId);
  const update = useUpdateBatchLiveClassSettings(batchId);

  const [override, setOverride] = useState<LiveClassSettingsOverride>({});
  const [locks, setLocks] = useState<LockableLiveSetting[]>([]);
  useEffect(() => {
    if (data) {
      setOverride(data.batchOverride ?? {});
      setLocks(data.batchLocks);
    }
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <WidgetError message="Couldn't load batch settings." onRetry={() => refetch()} />;
  }

  const resolved = resolveLiveClassSettings({
    system: data.system,
    batch: override,
    systemLocks: data.systemLocks,
  });
  const dirty =
    JSON.stringify(override) !== JSON.stringify(data.batchOverride ?? {}) ||
    JSON.stringify(locks) !== JSON.stringify(data.batchLocks);

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Defaults for every live class in this batch. Unset options inherit the platform default.
        A coach can override an option for an individual class unless it is locked here or by
        the academy.
      </p>

      <LiveClassSettingsForm
        scope="batch"
        override={override}
        onOverrideChange={setOverride}
        resolved={resolved}
        inheritedFrom={data.system}
        disabled={!data.canEdit || update.isPending}
        lockSources={liveClassLockSources({ systemLocks: data.systemLocks })}
        locks={locks}
        onLocksChange={data.canEdit ? setLocks : undefined}
      />

      {data.canEdit && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOverride(data.batchOverride ?? {});
              setLocks(data.batchLocks);
            }}
            disabled={update.isPending || !dirty}
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={() =>
              update.mutate({
                liveClassSettings: Object.keys(override).length > 0 ? override : null,
                locks,
              })
            }
            disabled={update.isPending || !dirty}
          >
            {update.isPending ? "Saving…" : "Save batch defaults"}
          </Button>
        </div>
      )}
    </div>
  );
}
