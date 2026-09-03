"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { ClassSettingsPanel } from "./ClassSettingsPanel";
import {
  useClassLiveSettings,
  useLiveClassPresets,
  useUpdateClassLiveSettings,
} from "./hooks";

/**
 * Pre-class configuration for one class, shown on the class start page. Editable
 * while the class is SCHEDULED; read-only once it has started (the running
 * session keeps the settings it began with).
 */
export function LiveClassSettingsSection({
  classId,
  defaultOpen = false,
}: {
  classId: string;
  defaultOpen?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useClassLiveSettings(classId);
  const { data: presetData } = useLiveClassPresets();
  const update = useUpdateClassLiveSettings(classId);

  const [open, setOpen] = useState(defaultOpen);
  const [override, setOverride] = useState<LiveClassSettingsOverride>({});

  useEffect(() => {
    if (data) setOverride(data.classOverride ?? {});
  }, [data]);

  const editable = !!data?.canEdit && !data?.snapshot;
  const dirty = JSON.stringify(override) !== JSON.stringify(data?.classOverride ?? {});

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-5 text-left sm:p-6"
      >
        <span className="flex items-center gap-2.5">
          <SlidersHorizontal className="size-5 text-primary" strokeWidth={2.5} />
          <span className="text-lg font-bold text-app-text">Class settings</span>
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-app-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-app-border p-5 sm:p-6">
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : isError || !data ? (
            <WidgetError message="Couldn't load class settings." onRetry={() => refetch()} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">
                How this class behaves before and while students are in it. Unset options inherit
                the batch default, then the platform default.
              </p>

              {data.snapshot && (
                <div className="flex gap-2.5 rounded-control border border-app-border bg-app-soft/40 p-3 text-xs text-app-muted">
                  <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                  <span>
                    This class has already started — the live session keeps the settings it began
                    with. Changes here apply to future sessions of this class.
                  </span>
                </div>
              )}

              <ClassSettingsPanel
                system={data.system}
                batchOverride={data.batchOverride}
                value={override}
                onChange={setOverride}
                presets={presetData?.presets ?? []}
                disabled={!editable}
              />

              {editable && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOverride(data.classOverride ?? {})}
                    disabled={update.isPending || !dirty}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      update.mutate({
                        liveClassSettings:
                          Object.keys(override).length > 0 ? override : null,
                      })
                    }
                    disabled={update.isPending || !dirty}
                  >
                    {update.isPending ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
