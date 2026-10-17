"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useAdminPayrollPeriods } from "../hooks/usePayrollApi";
import { CreatePeriodDialog } from "./CreatePeriodDialog";
import { PayrollPeriodStatusBadge } from "./PayrollBadges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

/** Admin → Finance → Coach Payroll → Periods. */
export function AdminPayrollPeriodsPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminPayrollPeriods();
  const { rows: periods, sortProps } = useTableSort({
    rows: data?.periods,
    accessors: {
      calculated: (p) => p.calculatedAt,
      finalized: (p) => p.finalizedAt,
      period: (p) => p.periodType,
      range: (p) => p.startDate,
      status: (p) => p.status
    }
  });
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-app-muted">
          One row per payroll run. Calculating, reviewing, approving and finalizing
          all happen on a period&apos;s own page.
        </p>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
          New period
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {data && data.periods.length === 0 ? (
        <EmptyState
          action={{ label: "Create the first period", onClick: () => setCreating(true) }}
          description="Create a payroll period to start computing what each coach is owed."
          title="No payroll periods yet"
        />
      ) : null}

      {data && data.periods.length > 0 ? (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[640px] border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border">
                  {([["Period", "period"], ["Range", "range"], ["Status", "status"], ["Calculated", "calculated"], ["Finalized", "finalized"], ["", null]] as const).map(([heading, sortKey]) => (
                    <TableHead
                      className="px-4 py-3 text-left text-xs font-semibold"
                      key={heading}
                    >
                      {sortKey ? <SortButton label={heading} {...sortProps(sortKey)} /> : heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow className="border-b border-app-border last:border-0" key={period.id}>
                    <TableCell className="text-left px-4 py-3 text-sm font-semibold text-app-text">
                      {period.periodType}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm text-app-muted">
                      {formatFullDate(period.startDate, "UTC")} – {formatFullDate(period.endDate, "UTC")}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <PayrollPeriodStatusBadge status={period.status} />
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-xs text-app-muted">
                      {period.calculatedAt ? formatFullDate(period.calculatedAt, timeZone) : "—"}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-xs text-app-muted">
                      {period.finalizedAt ? formatFullDate(period.finalizedAt, timeZone) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/finance/coach-payroll/periods/${period.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      {creating ? <CreatePeriodDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
