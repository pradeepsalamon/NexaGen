"use client";

import { useState } from "react";
import type { GameAutoSyncPolicy } from "@nexa-chess/types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useGameSources, useSetAutoSyncPolicy } from "../hooks/useGameAnalysis";

const POLICY_OPTIONS: { label: string; value: GameAutoSyncPolicy }[] = [
  { label: "Off", value: "OFF" },
  { label: "Students choose", value: "OPTIONAL" },
  { label: "Required for every student", value: "REQUIRED" },
];

const POLICY_HELP: Record<GameAutoSyncPolicy, string> = {
  OFF: "Nothing syncs by itself. Students, coaches and admins can still start an import by hand.",
  OPTIONAL:
    "Each student chooses for their own linked accounts. A coach or admin can set Always sync or Never sync for a student on the Games tab of their progress page.",
  REQUIRED:
    "Every verified linked account syncs about once a day and students can't turn it off. A coach or admin can still exempt one student with Never sync, and unlinking an account always stops it.",
};

/** The academy-wide setting for automatic game sync. */
export function AdminGameSyncClient() {
  const sources = useGameSources();
  const save = useSetAutoSyncPolicy();
  const [draft, setDraft] = useState<GameAutoSyncPolicy | null>(null);

  const saved = sources.data?.config.autoSyncPolicy;
  const policy = draft ?? saved ?? "OFF";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        description="Bring in games from students' linked Lichess and Chess.com accounts about once a day. Only public games from accounts a student has proved are theirs."
        title="Game sync"
      />
      {sources.isLoading ? (
        <Skeleton className="h-40 w-full rounded-app" />
      ) : sources.isError || !sources.data ? (
        <WidgetError message={sources.error?.message} onRetry={() => void sources.refetch()} />
      ) : (
        <Card className="space-y-4 p-4">
          {!sources.data.config.externalImportEnabled && (
            <Alert variant="warning">
              Linked accounts are switched off on this server (EXTERNAL_GAME_IMPORT_ENABLED), so nothing syncs whatever you choose here.
            </Alert>
          )}
          <div className="space-y-1 sm:max-w-sm">
            <Label htmlFor="auto-sync-policy">Automatic sync</Label>
            <Select
              id="auto-sync-policy"
              onChange={(e) => setDraft(e.target.value as GameAutoSyncPolicy)}
              options={POLICY_OPTIONS}
              value={policy}
            />
          </div>
          <p className="text-sm text-app-muted">{POLICY_HELP[policy]}</p>
          <div className="flex justify-end">
            <Button
              disabled={policy === saved || save.isPending}
              onClick={() =>
                save.mutate(policy, {
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save."),
                  onSuccess: () => {
                    setDraft(null);
                    toast.success("Saved. It applies from the next hourly run.");
                  },
                })
              }
            >
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
