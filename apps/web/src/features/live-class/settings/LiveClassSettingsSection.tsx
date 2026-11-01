"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, History, Info, SlidersHorizontal } from "lucide-react";
import { withoutLockedFields, type LiveClassSettingsOverride } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { ClassSettingsPanel } from "./ClassSettingsPanel";
import { isEmptyOverride } from "./fields";
import { readLastUsedClassSettings } from "./lastUsed";
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
  const userId = useAuthStore((state) => state.user?.id);

  const [open, setOpen] = useState(defaultOpen);
  const [override, setOverride] = useState<LiveClassSettingsOverride>({});
  /** True while the form shows remembered settings the coach hasn't saved here yet. */
  const [prefilled, setPrefilled] = useState(false);
  // Mirrors of the two above, so the sync effect can read them without taking
  // them as dependencies (which would make it re-run on every edit).
  const overrideRef = useRef<LiveClassSettingsOverride>({});
  const prefilledRef = useRef(false);
  // Seed the remembered draft once per class — not again after a save.
  const seededRef = useRef<string | null>(null);

  const editable = !!data?.canEdit && !data?.snapshot;

  const applyOverride = useCallback(
    (next: LiveClassSettingsOverride, isPrefill: boolean) => {
      overrideRef.current = next;
      prefilledRef.current = isPrefill;
      setOverride(next);
      setPrefilled(isPrefill);
    },
    [],
  );

  useEffect(() => {
    if (!data) return;
    const saved = data.classOverride ?? {};

    if (seededRef.current !== classId) {
      seededRef.current = classId;
      // This class has no settings of its own: start it on whatever this coach
      // last saved, pre-selected but unsaved, so they only have to confirm.
      if (isEmptyOverride(saved) && data.canEdit && !data.snapshot) {
        const remembered = readLastUsedClassSettings(userId);
        if (remembered) {
          applyOverride(remembered.override, true);
          return;
        }
      }
    } else if (
      prefilledRef.current &&
      JSON.stringify(saved) !== JSON.stringify(overrideRef.current)
    ) {
      // A background refetch landed while a remembered draft is still pending —
      // keep the draft rather than snapping the form back to the saved values.
      return;
    }

    applyOverride(saved, false);
  }, [data, classId, userId, applyOverride]);

  const dirty = JSON.stringify(override) !== JSON.stringify(data?.classOverride ?? {});

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-5 text-left sm:p-6"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2.5">
          <SlidersHorizontal className="size-5 shrink-0 text-primary-ink" strokeWidth={2.5} />
          <span className="text-lg font-bold text-app-text">Class settings</span>
          {prefilled && (
            <Badge variant="outline" className="gap-1 py-0.5 text-[10px] font-semibold">
              <History className="size-3" strokeWidth={2.5} />
              Your last settings — not saved yet
            </Badge>
          )}
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

              {prefilled && (
                <div className="flex flex-wrap items-center gap-2.5 rounded-control border border-primary/30 bg-primary/5 p-3 text-xs text-app-text">
                  <History className="size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
                  <span className="min-w-0 flex-1">
                    Pre-selected from the settings you last saved. Save to apply them to this
                    class, or reset to inherit the batch and platform defaults.
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-primary-ink underline-offset-2 hover:underline"
                    onClick={() => applyOverride(data.classOverride ?? {}, false)}
                  >
                    Don&apos;t use
                  </button>
                </div>
              )}

              <ClassSettingsPanel
                system={data.system}
                batchOverride={data.batchOverride}
                value={override}
                onChange={(next) => applyOverride(next, false)}
                presets={presetData?.presets ?? []}
                disabled={!editable}
                systemLocks={data.systemLocks}
                batchLocks={data.batchLocks}
              />

              {editable && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => applyOverride(data.classOverride ?? {}, false)}
                    disabled={update.isPending || !dirty}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      // Locked fields never apply; leaving a remembered value for
                      // one in the request would only earn a 403.
                      const unlocked =
                        withoutLockedFields(override, [...data.systemLocks, ...data.batchLocks]) ?? {};
                      update.mutate({
                        liveClassSettings: Object.keys(unlocked).length > 0 ? unlocked : null,
                      });
                    }}
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
