"use client";

import { Download } from "lucide-react";
import { formatMoney } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { formatFullDate } from "@/lib/datetime";
import { myPayslipPdfUrl } from "../api/payrollApi";
import { useMyPayrollRecords, useMyPayslips } from "../hooks/usePayrollApi";
import { PayrollRecordStatusBadge } from "./PayrollBadges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

/** Coach → Earnings (§18): payroll history + payslip downloads, read-only. */
export function CoachEarningsClient() {
  const { data: recordsData, isLoading } = useMyPayrollRecords();
  const { data: payslipsData } = useMyPayslips();

  const { rows: records, sortProps } = useTableSort({
    rows: recordsData?.records,
    accessors: {
      classes: (r) => r.completedClassesCount,
      gross: (r) => r.grossEarningsMinor,
      hours: (r) => r.totalTeachingSeconds,
      net: (r) => r.netPayableMinor,
      period: (r) => r.period.startDate,
      status: (r) => r.status
    }
  });
  const payslipByRecord = new Map((payslipsData?.payslips ?? []).map((p) => [p.payrollRecordId, p]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-app-text">Earnings</h1>
        <p className="text-sm text-app-muted">
          Your payroll history, computed from your teaching activity. Only an admin can
          change a rate or add an adjustment.
        </p>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {records.length === 0 && !isLoading ? (
        <EmptyState
          description="Payroll periods you're included in will appear here once calculated."
          title="No earnings yet"
        />
      ) : null}

      {records.length > 0 ? (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[720px] border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border">
                  {([["Period", "period"], ["Classes", "classes"], ["Hours", "hours"], ["Gross", "gross"], ["Net", "net"], ["Status", "status"], ["Payslip", null]] as const).map(([heading, sortKey]) => (
                    <TableHead
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      key={heading}
                    >
                      {sortKey ? <SortButton label={heading} {...sortProps(sortKey)} /> : heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const payslip = payslipByRecord.get(record.id);
                  return (
                    <TableRow className="border-b border-app-border last:border-0" key={record.id}>
                      <TableCell className="text-left px-4 py-3 text-sm text-app-text">
                        {formatFullDate(record.period.startDate, "UTC")} –{" "}
                        {formatFullDate(record.period.endDate, "UTC")}
                      </TableCell>
                      <TableCell className="text-left px-4 py-3 text-sm text-app-muted">
                        {record.completedClassesCount}/{record.scheduledClassesCount}
                      </TableCell>
                      <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-muted">
                        {(record.totalTeachingSeconds / 3600).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-text">
                        {formatMoney(record.grossEarningsMinor, "INR")}
                      </TableCell>
                      <TableCell className="text-left px-4 py-3 text-sm font-semibold tabular-nums text-primary-ink">
                        {formatMoney(record.netPayableMinor, "INR")}
                      </TableCell>
                      <TableCell className="text-left px-4 py-3">
                        <PayrollRecordStatusBadge status={record.status} />
                      </TableCell>
                      <TableCell className="text-left px-4 py-3">
                        {payslip && payslip.pdfStatus === "READY" ? (
                          <SimpleTooltip label="Download your payslip">
                            <Button
                              aria-label={`Download payslip ${payslip.documentNumber}`}
                              asChild
                              className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                              size="icon"
                              variant="ghost"
                            >
                              <a
                                href={myPayslipPdfUrl(payslip.id)}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                <Download className="size-4" strokeWidth={2.5} />
                              </a>
                            </Button>
                          </SimpleTooltip>
                        ) : (
                          <span className="text-xs text-app-muted">
                            {payslip ? "Generating…" : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
