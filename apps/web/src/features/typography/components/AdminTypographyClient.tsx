"use client";

import { useEffect, useState } from "react";
import { Info, Lock } from "lucide-react";
import { DEFAULT_TYPOGRAPHY, type Typography } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import {
  useResetTypographyAdminMutation,
  useTypographyAdminQuery,
  useUpdateTypographyAdminMutation
} from "../hooks/useTypographyApi";
import { TypographyFields } from "./TypographyFields";
import { Switch } from "@/components/ui/Switch";

export function AdminTypographyClient() {
  const { data, isLoading, isError, refetch } = useTypographyAdminQuery();
  const updateMutation = useUpdateTypographyAdminMutation();
  const resetMutation = useResetTypographyAdminMutation();

  const [draft, setDraft] = useState<Typography>(DEFAULT_TYPOGRAPHY);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(data.resolved);
    setLocked(data.locked);
  }, [data]);

  const dirty = data
    ? JSON.stringify(draft) !== JSON.stringify(data.resolved) || locked !== data.locked
    : false;
  const isBusy = updateMutation.isPending || resetMutation.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Fonts &amp; text</h1>
        <p className="mt-1 text-sm text-app-muted">
          The platform-wide fonts and text size. Everyone sees these unless they pick their own in
          their profile.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-5 sm:p-6">
          <Skeleton className="h-96 w-full" />
        </Card>
      ) : isError || !data ? (
        <Card className="p-5 sm:p-6">
          <WidgetError message="Couldn't load the platform fonts." onRetry={() => refetch()} />
        </Card>
      ) : (
        <>
          <div className="flex items-start gap-2.5 rounded-app border border-app-border bg-primary/5 p-3.5 text-sm text-app-text">
            <Info className="mt-0.5 size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
            <p>
              Users who already chose their own fonts or text size keep them, unless you lock the
              settings below.
            </p>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 size-4 shrink-0 text-app-muted" strokeWidth={2.5} />
                <div>
                  <h2 className="text-lg font-bold text-app-text">Lock text settings</h2>
                  <p className="mt-1 text-sm text-app-muted">
                    When on, every user sees exactly these fonts and size and can&apos;t choose their
                    own.
                  </p>
                </div>
              </div>
              <Switch
                aria-label="Lock text settings for everyone"
                checked={locked}
                id="typography-locked"
                onCheckedChange={(checked) => setLocked(checked === true)}
              />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <TypographyFields
              disabled={isBusy}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              value={draft}
            />
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={isBusy}
              isLoading={resetMutation.isPending}
              // undo: intentionally excluded — singleton settings Save (see lib/undo/README.md)
              onClick={() => resetMutation.mutate()}
              variant="outline"
            >
              Reset to Nexa default
            </Button>
            <Button
              disabled={!dirty || isBusy}
              isLoading={updateMutation.isPending}
              // undo: intentionally excluded — singleton settings Save (see lib/undo/README.md)
              onClick={() => updateMutation.mutate({ settings: draft, locked })}
            >
              Save changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
