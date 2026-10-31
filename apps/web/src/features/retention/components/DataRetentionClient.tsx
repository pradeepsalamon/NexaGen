"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  RETENTION_CATALOGUE,
  RETENTION_MAX_DAYS,
  retentionDaysError,
  type RetentionPolicyItem
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useRetentionPolicies, useRetentionPreview, useUpdateRetentionPolicy } from "../hooks/useRetentionApi";

const count = (n: number) => new Intl.NumberFormat("en-IN").format(n);
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

export function DataRetentionClient() {
  const tz = useUserTimeZone();
  const { data, error, isLoading, refetch } = useRetentionPolicies();
  const [editing, setEditing] = useState<RetentionPolicyItem | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        description={
          <>
            Choose how long chat, notifications and activity records are kept. A nightly sweep deletes
            anything older for good: it doesn&apos;t go to Trash and can&apos;t be restored.
            {data ? <> Next sweep: {formatDateTime(data.nextSweepAt, tz)}.</> : null}
          </>
        }
        title="Data retention"
      />

      {error ? (
        <WidgetError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton className="h-28 w-full rounded-app" key={i} />
          ))}
        </div>
      ) : (
        <>
          <section aria-labelledby="retention-chosen" className="space-y-3">
            <h2 className="text-lg font-bold text-app-text" id="retention-chosen">
              Records you choose
            </h2>
            {data.policies.map((policy) => (
              <PolicyCard key={policy.category} onEdit={() => setEditing(policy)} policy={policy} tz={tz} />
            ))}
          </section>

          <section aria-labelledby="retention-fixed" className="space-y-3">
            <h2 className="text-lg font-bold text-app-text" id="retention-fixed">
              Fixed by the system
            </h2>
            <Card className="divide-y divide-app-border p-0">
              {data.fixedRules.map((rule) => (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" key={rule.label}>
                  <span className="flex min-w-0 items-center gap-2 text-sm text-app-text">
                    <Lock aria-hidden="true" className="size-4 shrink-0 text-app-muted" strokeWidth={2.25} />
                    {rule.label}
                  </span>
                  <span className="text-sm text-app-muted">
                    {rule.days === 1 ? "A day after they expire" : `After ${rule.days} days`}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        </>
      )}

      <EditPolicyDialog onClose={() => setEditing(null)} policy={editing} tz={tz} />
    </div>
  );
}

function PolicyCard({ onEdit, policy, tz }: { onEdit: () => void; policy: RetentionPolicyItem; tz: string }) {
  const info = RETENTION_CATALOGUE[policy.category];
  const facts: string[] = [];
  facts.push(policy.oldestRecordAt ? `Oldest record ${formatFullDate(policy.oldestRecordAt, tz)}` : "No records yet");
  if (policy.eligibleCount !== null && policy.eligibleCount > 0) {
    facts.push(`${plural(policy.eligibleCount, "record", "records")} go at the next sweep`);
  }
  if (policy.lastSweptAt && policy.lastDeletedCount !== null) {
    facts.push(`Last sweep ${formatFullDate(policy.lastSweptAt, tz)} deleted ${count(policy.lastDeletedCount)}`);
  }
  if (policy.updatedAt) {
    facts.push(`Changed ${formatFullDate(policy.updatedAt, tz)}${policy.updatedByName ? ` by ${policy.updatedByName}` : ""}`);
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-app-text">{info.label}</span>
          {policy.days === null ? (
            <Badge variant="secondary">Kept forever</Badge>
          ) : (
            <Badge variant="warning">Deleted after {count(policy.days)} days</Badge>
          )}
        </div>
        <p className="text-sm text-app-muted">{info.description}</p>
        <p className="text-sm text-app-muted">{facts.join(" · ")}</p>
      </div>
      <Button className="shrink-0 self-end sm:self-start" onClick={onEdit} type="button" variant="outline">
        Change
      </Button>
    </Card>
  );
}

function EditPolicyDialog({
  onClose,
  policy,
  tz
}: {
  onClose: () => void;
  policy: RetentionPolicyItem | null;
  tz: string;
}) {
  const toast = useToast();
  const update = useUpdateRetentionPolicy();
  const [enabled, setEnabled] = useState(false);
  const [daysText, setDaysText] = useState("");

  const info = policy ? RETENTION_CATALOGUE[policy.category] : null;

  // Seed the form each time a different policy opens.
  useEffect(() => {
    if (!policy) return;
    const info = RETENTION_CATALOGUE[policy.category];
    setEnabled(policy.days !== null);
    setDaysText(String(policy.days ?? info.recommendedDays));
  }, [policy]);

  const days = enabled ? Number(daysText) : null;
  const daysError = policy && enabled ? (daysText.trim() === "" ? "Enter a number of days." : retentionDaysError(policy.category, days)) : null;
  const debouncedDays = useDebouncedValue(days, 300);
  const preview = useRetentionPreview(
    policy && enabled && !daysError && debouncedDays === days ? policy.category : null,
    days
  );
  const unchanged = policy ? policy.days === days : true;
  const deletes = enabled && preview.data ? preview.data.eligibleCount : 0;

  const save = () => {
    if (!policy || !info || daysError) return;
    update.mutate(
      { body: { days }, category: policy.category },
      {
        onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save" }),
        onSuccess: () => {
          toast.success({
            title: days === null ? `${info.label}: kept forever` : `${info.label}: kept ${count(days)} days`
          });
          onClose();
        }
      }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={!!policy}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{info ? `How long to keep ${info.label.toLowerCase()}` : "Retention"}</DialogTitle>
          <DialogDescription>{info?.description}</DialogDescription>
        </DialogHeader>

        {policy && info ? (
          <div className="mt-4 space-y-4">
            <Switch
              checked={enabled}
              label="Delete old records"
              onCheckedChange={setEnabled}
            />

            {enabled ? (
              <>
                <FormField
                  error={daysError ?? undefined}
                  hint={`Between ${info.minDays} and ${count(RETENTION_MAX_DAYS)} days. Recommended: ${info.recommendedDays}.`}
                  id="retention-days"
                  label="Keep for (days)"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-32"
                      hasError={!!daysError}
                      id="retention-days"
                      inputMode="numeric"
                      max={RETENTION_MAX_DAYS}
                      min={info.minDays}
                      onChange={(e) => setDaysText(e.target.value)}
                      type="number"
                      value={daysText}
                    />
                    {days !== info.recommendedDays ? (
                      <Button
                        onClick={() => setDaysText(String(info.recommendedDays))}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Use {info.recommendedDays}
                      </Button>
                    ) : null}
                  </div>
                </FormField>

                {daysError ? null : preview.isError ? (
                  <Alert variant="error">{getErrorMessage(preview.error)}</Alert>
                ) : !preview.data || preview.isFetching ? (
                  <Skeleton className="h-16 w-full rounded-app" />
                ) : preview.data.eligibleCount > 0 ? (
                  <Alert title={`${plural(preview.data.eligibleCount, "record", "records")} will be deleted`} variant="warning">
                    Everything created before {formatFullDate(preview.data.cutoff, tz)} goes at the next sweep, and
                    after that each night as records reach {count(preview.data.days)} days. {info.impact}
                  </Alert>
                ) : (
                  <Alert variant="info">
                    Nothing is older than {count(preview.data.days)} days yet. From now on, records are deleted
                    as they reach that age. {info.impact}
                  </Alert>
                )}
              </>
            ) : (
              <p className="text-sm text-app-muted">
                The nightly sweep leaves these records alone, however old they are.
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter className="mt-6">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!policy || unchanged || !!daysError || update.isPending || (enabled && !preview.data)}
            onClick={save}
            type="button"
            variant={deletes > 0 ? "destructive" : "primary"}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
