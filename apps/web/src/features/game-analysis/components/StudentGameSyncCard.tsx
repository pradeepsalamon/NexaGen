"use client";

import {
  EXTERNAL_CHESS_PROVIDER_LABELS,
  resolveAutoSync,
  type ExternalChessAccountDto,
  type GameAutoSyncRule,
  type StudentGameSources,
} from "@nexa-chess/types";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useAuthStore } from "@/stores/authStore";
import { useSetStudentAutoSyncRule, useStudentGameSources, useSyncAccount } from "../hooks/useGameAnalysis";

const STUDENT_CHOICE = "STUDENT_CHOICE";
const RULE_OPTIONS = [
  { label: "Student decides", value: STUDENT_CHOICE },
  { label: "Always sync", value: "ALWAYS" },
  { label: "Never sync", value: "NEVER" },
];

function ruleNote({ autoSyncPolicy, autoSyncRule }: StudentGameSources): string {
  if (autoSyncPolicy === "OFF") return "Automatic sync is off for the academy, so this rule has no effect until an admin turns it on.";
  if (autoSyncRule === "NEVER") return "This student's games stay out of automatic sync, even if the academy requires it.";
  if (autoSyncPolicy === "REQUIRED") return "The academy requires automatic sync for every student. Choose Never sync to exempt this student.";
  if (autoSyncRule === "ALWAYS") return "The student can't turn automatic sync off, but unlinking an account still stops it.";
  return "The student chooses for each linked account.";
}

/** A coach's or admin's controls for one student's game sync. */
export function StudentGameSyncCard({ studentId }: { studentId: string }) {
  const sources = useStudentGameSources(studentId);
  const setRule = useSetStudentAutoSyncRule(studentId);
  const isCoach = useAuthStore((state) => state.user?.role === "COACH");

  if (sources.isLoading) return <Skeleton className="h-32 w-full rounded-app" />;
  if (sources.isError || !sources.data) {
    return <WidgetError message={sources.error?.message} onRetry={() => void sources.refetch()} />;
  }
  const data = sources.data;
  if (!data.externalImportEnabled) return null;
  const locked = isCoach && data.autoSyncRuleByAdmin;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold">Automatic game sync</h2>
          <p className="text-sm text-app-muted">
            {locked ? "An academy admin set this rule, so only an admin can change it." : ruleNote(data)}
          </p>
        </div>
        <div className="space-y-1 sm:w-48 sm:shrink-0">
          <Label htmlFor="auto-sync-rule">Rule for this student</Label>
          <Select
            disabled={locked || setRule.isPending}
            id="auto-sync-rule"
            onChange={(e) =>
              setRule.mutate(e.target.value === STUDENT_CHOICE ? null : (e.target.value as GameAutoSyncRule), {
                onError: (err) => toast.error(err instanceof Error ? err.message : "Could not change the rule."),
              })
            }
            options={RULE_OPTIONS}
            value={data.autoSyncRule ?? STUDENT_CHOICE}
          />
        </div>
      </div>
      {data.accounts.length === 0 ? (
        <p className="text-sm text-app-muted">
          No linked accounts yet. Only the student can link one, because they have to prove it’s theirs. Sync follows this rule once they do.
        </p>
      ) : (
        data.accounts.map((account) => <SyncedAccount account={account} data={data} key={account.id} />)
      )}
    </Card>
  );
}

function SyncedAccount({ account, data }: { account: ExternalChessAccountDto; data: StudentGameSources }) {
  const tz = useUserTimeZone();
  const sync = useSyncAccount();
  const { enabled } = resolveAutoSync({
    policy: data.autoSyncPolicy,
    rule: data.autoSyncRule,
    studentChoice: account.autoSync,
  });
  const coolingDown = account.nextSyncAllowedAt ? new Date(account.nextSyncAllowedAt).getTime() > Date.now() : false;

  return (
    <div className="space-y-2 rounded-control border border-app-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a className="truncate font-semibold text-primary-ink underline-offset-2 hover:underline" href={account.profileUrl} rel="noreferrer" target="_blank">
            {EXTERNAL_CHESS_PROVIDER_LABELS[account.provider]} · {account.username}
          </a>
          {!account.verified ? (
            <Badge variant="warning">Not verified</Badge>
          ) : enabled ? (
            <Badge variant="success">Syncing daily</Badge>
          ) : (
            <Badge variant="secondary">Not syncing</Badge>
          )}
        </div>
        {account.verified && (
          <Button
            disabled={sync.isPending || coolingDown || account.syncStatus === "SYNCING"}
            onClick={() =>
              sync.mutate(
                { analyse: false, id: account.id },
                {
                  onError: (err) => toast.error(err instanceof Error ? err.message : "The sync failed."),
                  onSuccess: (res) => toast.success(`${res.imported} new game(s)${res.more ? ", more waiting" : ""}`),
                },
              )
            }
            variant="outline"
          >
            {sync.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 size-4" aria-hidden />}
            Sync now
          </Button>
        )}
      </div>
      {account.syncError && account.syncStatus !== "IDLE" && <Alert variant="warning">{account.syncError}</Alert>}
      <p className="text-xs text-app-muted">
        {account.gamesImported} games imported
        {account.lastSyncedAt ? ` · last import ${formatDateTime(account.lastSyncedAt, tz)}` : " · nothing imported yet"}
      </p>
    </div>
  );
}
