"use client";

import { useEffect, useState } from "react";
import {
  resolveLiveClassSettings,
  type LiveClassSettingsOverride,
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
  useEffect(() => {
    if (data) setOverride(data.batchOverride ?? {});
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <WidgetError message="Couldn't load batch settings." onRetry={() => refetch()} />;
  }

  const resolved = resolveLiveClassSettings({ system: data.system, batch: override });
  const dirty = JSON.stringify(override) !== JSON.stringify(data.batchOverride ?? {});

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Defaults for every live class in this batch. Unset options inherit the platform default;
        a coach can still override any option for an individual class.
      </p>

      <LiveClassSettingsForm
        scope="batch"
        override={override}
        onOverrideChange={setOverride}
        resolved={resolved}
        inheritedFrom={data.system}
        disabled={!data.canEdit || update.isPending}
      />

      {data.canEdit && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOverride(data.batchOverride ?? {})}
            disabled={update.isPending || !dirty}
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={() =>
              update.mutate({
                liveClassSettings: Object.keys(override).length > 0 ? override : null,
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
