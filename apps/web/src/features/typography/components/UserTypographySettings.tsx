"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { DEFAULT_TYPOGRAPHY, type Typography } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import {
  useResetTypographyMutation,
  useResolvedTypographyQuery,
  useUpdateTypographyMutation
} from "../hooks/useTypographyApi";
import { TypographyFields } from "./TypographyFields";

/** The signed-in user's own fonts + text size, layered over the platform default. */
export function UserTypographySettings() {
  const { data, isLoading, isError, refetch } = useResolvedTypographyQuery();
  const updateMutation = useUpdateTypographyMutation();
  const resetMutation = useResetTypographyMutation();
  const [draft, setDraft] = useState<Typography>(DEFAULT_TYPOGRAPHY);

  useEffect(() => {
    if (data) setDraft(data.config);
  }, [data]);

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (isError || !data) {
    return <WidgetError message="Couldn't load your text settings." onRetry={() => refetch()} />;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.config);
  const isBusy = updateMutation.isPending || resetMutation.isPending;

  return (
    <div className="space-y-4">
      {data.locked ? (
        <div className="flex items-start gap-2.5 rounded-app border border-app-border bg-app-soft p-3.5 text-sm text-app-text">
          <Lock className="mt-0.5 size-4 shrink-0 text-app-muted" strokeWidth={2.5} />
          <p>Your administrator has set the fonts and text size for everyone.</p>
        </div>
      ) : null}

      <TypographyFields
        disabled={data.locked || isBusy}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        value={draft}
      />

      {data.locked ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {data.source === "user" ? (
            <Button
              disabled={isBusy}
              isLoading={resetMutation.isPending}
              // undo: intentionally excluded — singleton settings Save (see lib/undo/README.md)
              onClick={() => resetMutation.mutate()}
              variant="outline"
            >
              Use the platform default
            </Button>
          ) : null}
          <Button
            disabled={!dirty || isBusy}
            isLoading={updateMutation.isPending}
            // undo: intentionally excluded — singleton settings Save (see lib/undo/README.md)
            onClick={() => updateMutation.mutate({ settings: draft })}
          >
            Save text settings
          </Button>
        </div>
      )}
    </div>
  );
}
