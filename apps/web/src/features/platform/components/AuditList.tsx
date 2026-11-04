"use client";

import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { usePlatformAudit } from "../hooks/usePlatformApi";

const detailText = (details: Record<string, unknown>) =>
  Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");

/** Every platform write, newest first (one academy, or all of them). */
export function AuditList({ academyName, tenantId }: { academyName?: (tenantId: string) => string; tenantId?: string }) {
  const timeZone = useUserTimeZone();
  const audit = usePlatformAudit(tenantId);
  const entries = audit.data?.pages.flatMap((page) => page.entries) ?? [];

  if (audit.isError) return <WidgetError message="Could not load the audit log." onRetry={() => void audit.refetch()} />;
  if (audit.isLoading) return <Skeleton className="h-40 w-full" />;
  if (entries.length === 0) return <EmptyState icon={ScrollText} title="Nothing logged yet" variant="inline" />;

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-panel border border-app-border bg-app-surface shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              {academyName ? <TableHead>Academy</TableHead> : null}
              <TableHead>By</TableHead>
              <TableHead>Reason and details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt, timeZone)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{entry.action}</TableCell>
                {academyName ? (
                  <TableCell>{entry.targetTenantId ? academyName(entry.targetTenantId) : "—"}</TableCell>
                ) : null}
                <TableCell>{entry.actorName ?? "System"}</TableCell>
                <TableCell className="min-w-56 text-sm">
                  {entry.reason ? <p className="text-app-text">{entry.reason}</p> : null}
                  <p className="break-all text-xs text-app-muted">{detailText(entry.details)}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {audit.hasNextPage ? (
        <Button
          className="justify-self-center"
          isLoading={audit.isFetchingNextPage}
          onClick={() => void audit.fetchNextPage()}
          type="button"
          variant="neutral"
        >
          Load older entries
        </Button>
      ) : null}
    </div>
  );
}
