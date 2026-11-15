"use client";

import { LifeBuoy, Square } from "lucide-react";
import type { PlatformSupportSessionItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";

function visitState(visit: PlatformSupportSessionItem) {
  if (visit.isActive) return visit.enteredAt ? { label: "Active", variant: "warning" as const } : { label: "Link sent", variant: "info" as const };
  return { label: visit.endedAt ? "Ended" : "Expired", variant: "secondary" as const };
}

/** Support visits: the console's list (with "End") and the academy's own history (read-only). */
export function SupportVisitsTable({
  academyName,
  onEnd,
  visits
}: {
  /** Console only: shows which academy each visit was to. */
  academyName?: (tenantId: string) => string;
  onEnd?: (visit: PlatformSupportSessionItem) => void;
  visits: PlatformSupportSessionItem[];
}) {
  const timeZone = useUserTimeZone();
  if (visits.length === 0) {
    return (
      <EmptyState
        description="Each visit by the NexaChess support team is listed here with its reason."
        icon={LifeBuoy}
        title="No support visits"
        variant="inline"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-panel border border-app-border bg-app-surface shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            {academyName ? <TableHead>Academy</TableHead> : null}
            <TableHead>By</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Changes made</TableHead>
            <TableHead>State</TableHead>
            {onEnd ? (
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visits.map((visit) => {
            const state = visitState(visit);
            return (
              <TableRow key={visit.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(visit.createdAt, timeZone)}</TableCell>
                {academyName ? <TableCell>{academyName(visit.tenantId)}</TableCell> : null}
                <TableCell>{visit.staffName ?? "NexaChess support"}</TableCell>
                <TableCell className="min-w-48 text-sm">{visit.reason}</TableCell>
                <TableCell className="text-right tabular-nums">{visit.actionCount}</TableCell>
                <TableCell>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </TableCell>
                {onEnd ? (
                  <TableCell>
                    {visit.isActive ? (
                      <RowActions
                        actions={[
                          {
                            ariaLabel: "End this support visit",
                            icon: Square,
                            label: "End visit",
                            onSelect: () => onEnd(visit),
                            tone: "danger"
                          }
                        ]}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
