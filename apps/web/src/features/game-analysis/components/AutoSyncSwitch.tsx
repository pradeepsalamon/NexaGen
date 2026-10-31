"use client";

import {
  resolveAutoSync,
  type ExternalChessAccountDto,
  type GameAutoSyncPolicy,
  type GameAutoSyncRule,
} from "@nexa-chess/types";
import { toast } from "sonner";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import { useSetAccountAutoSync } from "../hooks/useGameAnalysis";

/** The student's own switch; locked and explained when the academy or a coach decides. */
export function AutoSyncSwitch({
  account,
  policy,
  rule,
}: {
  account: ExternalChessAccountDto;
  policy: GameAutoSyncPolicy;
  rule: GameAutoSyncRule | null;
}) {
  const update = useSetAccountAutoSync();
  if (policy === "OFF") return null;

  const { enabled, lockedBy } = resolveAutoSync({ policy, rule, studentChoice: account.autoSync });
  const id = `auto-sync-${account.id}`;
  const hint =
    lockedBy === "ACADEMY"
      ? "Your academy requires this for every student. Unlinking the account stops it."
      : lockedBy === "STAFF"
        ? enabled
          ? "Your coach or academy turned this on. Unlinking the account stops it."
          : "Your coach or academy turned this off."
        : "About once a day, from the site’s public data.";

  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-app-border p-3">
      <div className="min-w-0">
        <Label htmlFor={id}>Bring in new games automatically</Label>
        <p className="text-xs text-app-muted">{hint}</p>
      </div>
      <Switch
        checked={enabled}
        disabled={lockedBy !== null || update.isPending}
        id={id}
        onCheckedChange={(autoSync) =>
          update.mutate(
            { autoSync, id: account.id },
            { onError: (err) => toast.error(err instanceof Error ? err.message : "Could not change this setting.") },
          )
        }
      />
    </div>
  );
}
