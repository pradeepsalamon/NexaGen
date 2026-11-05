"use client";

import type { TenantIntegrityRunStatus, TenantIntegrityRunSummary } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useIntegrityRuns, useRunIntegrityCheck } from "../hooks/usePlatformApi";

const STATUS: Record<TenantIntegrityRunStatus, { label: string; variant: "success" | "destructive" | "warning" }> = {
  FAILED: { label: "Not fully checked", variant: "warning" },
  OK: { label: "Nothing found", variant: "success" },
  VIOLATIONS: { label: "Cross-academy rows", variant: "destructive" }
};

const rowKeyText = (rowKey: Record<string, string>) =>
  Object.entries(rowKey)
    .map(([column, value]) => `${column}=${value}`)
    .join(", ");

function LatestRun({ academyName, run }: { run: TenantIntegrityRunSummary; academyName: (tenantId: string) => string }) {
  const timeZone = useUserTimeZone();
  const status = STATUS[run.status];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-app-muted">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span>
          {formatDateTime(run.startedAt, timeZone)} · {run.linksChecked} relationships checked ·{" "}
          {run.trigger === "manual" ? "run by hand" : "nightly"}
        </span>
      </div>
      {run.violations.map((violation) => (
        <div className="grid gap-2" key={`${violation.table}.${violation.column}`}>
          <h3 className="text-sm font-semibold text-app-text">
            {violation.table}.{violation.column} → {violation.parentTable}: {violation.count} row
            {violation.count === 1 ? "" : "s"}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Row&apos;s academy</TableHead>
                <TableHead>Points at</TableHead>
                <TableHead>That row&apos;s academy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {violation.samples.map((sample) => (
                <TableRow key={rowKeyText(sample.rowKey)}>
                  <TableCell className="font-mono text-xs">{rowKeyText(sample.rowKey)}</TableCell>
                  <TableCell>{sample.tenantId ? academyName(sample.tenantId) : "None"}</TableCell>
                  <TableCell className="font-mono text-xs">{sample.parentId}</TableCell>
                  <TableCell>{sample.parentTenantId ? academyName(sample.parentTenantId) : "None"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {violation.count > violation.samples.length ? (
            <p className="text-xs text-app-muted">
              Showing {violation.samples.length} of {violation.count} rows.
            </p>
          ) : null}
        </div>
      ))}
      {run.errors.length ? (
        <Alert title="Some relationships could not be checked" variant="warning">
          <ul className="list-disc pl-5">
            {run.errors.map((error) => (
              <li key={`${error.table}.${error.column}`}>
                <span className="font-mono text-xs">
                  {error.table}.{error.column}
                </span>
                : {error.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Platform console → Integrity: the nightly tenant integrity check
 * (docs/SAAS_MULTI_TENANCY.md "Tenant integrity monitoring"). Monitoring only.
 */
export function IntegrityTab({ academyName }: { academyName: (tenantId: string) => string }) {
  const runs = useIntegrityRuns();
  const runNow = useRunIntegrityCheck();
  const timeZone = useUserTimeZone();

  if (runs.isError) return <WidgetError message="Could not load integrity checks." onRetry={() => void runs.refetch()} />;
  if (runs.isLoading) return <Skeleton className="h-40 w-full" />;
  const list = runs.data?.runs ?? [];
  const [latest] = list;

  return (
    <div className="grid gap-4">
      <SectionCard
        actions={
          <Button disabled={runNow.isPending} onClick={() => runNow.mutate()} variant="outline">
            {runNow.isPending ? "Checking…" : "Run now"}
          </Button>
        }
        description="Every night at 03:40 UTC each relationship between academy tables is checked for a row that points at another academy's row. This is monitoring: it never blocks or changes anything. Platform operators acting on an academy are allowed."
        title="Tenant integrity"
      >
        {latest ? (
          <LatestRun academyName={academyName} run={latest} />
        ) : (
          <p className="text-sm text-app-muted">No check has run yet.</p>
        )}
      </SectionCard>
      {list.length > 1 ? (
        <SectionCard title="Earlier checks">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Rows found</TableHead>
                <TableHead className="text-right">Relationships</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.slice(1).map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    {formatDateTime(run.startedAt, timeZone)}
                    {run.trigger === "manual" ? " (by hand)" : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[run.status].variant}>{STATUS[run.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.violationCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.linksChecked}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : null}
    </div>
  );
}
