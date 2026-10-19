"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  useAdminPayouts,
  useAdminPayrollPeriod,
  useAdminPayrollRecords,
  useApprovePayrollPeriod,
  useCalculatePayrollPeriod,
  useCancelPayrollPeriod,
  useFinalizePayrollPeriod,
  useMarkPayrollPeriodPaid,
  useRecalculatePayrollPeriod
} from "../hooks/usePayrollApi";
import { PayrollPeriodStatusBadge, PayrollRecordStatusBadge } from "./PayrollBadges";
import { PayrollRecordDetailPanel } from "./PayrollRecordDetailPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

/** One payroll period: teaching summary, lifecycle actions, per-coach breakdown. */
export function AdminPayrollPeriodDetailClient({ periodId }: { periodId: string }) {
  const timeZone = useUserTimeZone();
  const { data: periodData, isLoading } = useAdminPayrollPeriod(periodId);
  const { data: recordsData } = useAdminPayrollRecords(periodId);
  const { data: payoutsData } = useAdminPayouts(periodId);
  const [expanded, setExpanded] = useState<string | null>(null);

  const calculate = useCalculatePayrollPeriod();
  const recalculate = useRecalculatePayrollPeriod();
  const approve = useApprovePayrollPeriod();
  const finalize = useFinalizePayrollPeriod();
  const markPaid = useMarkPayrollPeriodPaid();
  const cancel = useCancelPayrollPeriod();
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [periodActionPending, setPeriodActionPending] = useState(false);

  // One-way transitions with no reverse endpoint: held for the undo window
  // before they are sent, so a misclick can still be taken back.
  type PeriodAction = { kind: "cancel"; reason: string } | { kind: "finalize" } | { kind: "markPaid" };
  const { run: runPeriodAction } = useUndoableMutation<PeriodAction, unknown>({
    strategy: "defer",
    mutationFn: (action) =>
      action.kind === "cancel"
        ? cancel.mutateAsync({ id: periodId, body: action.reason ? { reason: action.reason } : {} })
        : action.kind === "finalize"
          ? finalize.mutateAsync(periodId)
          : markPaid.mutateAsync(periodId),
    undo: async () => {},
    onSchedule: () => setPeriodActionPending(true),
    onCancel: () => setPeriodActionPending(false),
    onCommitSuccess: () => setPeriodActionPending(false),
    toast: (action) => ({
      title:
        action.kind === "cancel"
          ? "Cancelling payroll period"
          : action.kind === "finalize"
            ? "Finalizing payroll period"
            : "Marking every coach paid"
    }),
    invalidates: []
  });

  const period = periodData?.period;
  const records = recordsData?.records ?? [];
  const { rows: sortedRecords, sortProps } = useTableSort({
    rows: recordsData?.records,
    accessors: {
      classes: (r) => r.completedClassesCount,
      coach: (r) => r.coachName,
      gross: (r) => r.grossEarningsMinor,
      hours: (r) => r.totalTeachingSeconds,
      net: (r) => r.netPayableMinor,
      status: (r) => r.status
    }
  });
  const payoutsByRecord = new Map((payoutsData?.payouts ?? []).map((p) => [p.payrollRecordId, p]));

  const currency = "INR";
  const totals = records.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossEarningsMinor,
      net: acc.net + r.netPayableMinor
    }),
    { gross: 0, net: 0 }
  );

  return (
    <div className="space-y-4">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href="/admin/finance/coach-payroll">
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          Back to payroll
        </Link>
      </Button>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {period ? (
        <>
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-app-text">{period.periodType} payroll</h1>
                  <PayrollPeriodStatusBadge status={period.status} />
                </div>
                <p className="text-sm text-app-muted">
                  {formatFullDate(period.startDate, "UTC")} – {formatFullDate(period.endDate, "UTC")}
                  {records.length > 0 ? ` · ${records.length} coach${records.length === 1 ? "" : "es"}` : ""}
                </p>
                {period.notes ? <p className="mt-1 text-xs text-app-muted">{period.notes}</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {period.status === "DRAFT" ? (
                  <Button
                    isLoading={calculate.isPending}
                    onClick={() => calculate.mutate(periodId)}
                  >
                    Calculate
                  </Button>
                ) : null}

                {period.status === "REVIEW" ? (
                  <>
                    <Button
                      isLoading={recalculate.isPending}
                      onClick={() => recalculate.mutate(periodId)}
                      variant="outline"
                    >
                      Recalculate
                    </Button>
                    <Button isLoading={approve.isPending} onClick={() => approve.mutate(periodId)}>
                      Approve
                    </Button>
                    <Button
                      isLoading={cancel.isPending}
                      onClick={() => {
                        setCancelReason("");
                        setCancelling(true);
                      }}
                      variant="outline"
                    >
                      Cancel period
                    </Button>
                  </>
                ) : null}

                {period.status === "APPROVED" ? (
                  <Button
                    disabled={periodActionPending}
                    isLoading={finalize.isPending}
                    onClick={() => void runPeriodAction({ kind: "finalize" })}
                  >
                    Finalize
                  </Button>
                ) : null}

                {period.status === "FINALIZED" ? (
                  <Button
                    disabled={periodActionPending}
                    isLoading={markPaid.isPending}
                    onClick={() => void runPeriodAction({ kind: "markPaid" })}
                  >
                    Mark period paid
                  </Button>
                ) : null}
              </div>
            </div>

            {period.status === "DRAFT" && records.length === 0 ? (
              <p className="text-xs text-app-muted">
                Calculating covers every coach with a class or a compensation profile in
                this date range. A class still scheduled/live inside the window blocks
                calculation until it settles.
              </p>
            ) : null}

            {records.length > 0 ? (
              <div className="flex flex-wrap gap-6 border-t border-app-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-app-muted">Gross payroll</p>
                  <p className="font-semibold tabular-nums text-app-text">
                    {formatMoney(totals.gross, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-app-muted">Net payable</p>
                  <p className="font-semibold tabular-nums text-primary-ink">
                    {formatMoney(totals.net, currency)}
                  </p>
                </div>
                {period.calculatedAt ? (
                  <div>
                    <p className="text-xs text-app-muted">Last calculated</p>
                    <p className="text-app-text">{formatFullDate(period.calculatedAt, timeZone)}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          {records.length === 0 ? (
            <EmptyState
              description={
                period.status === "DRAFT"
                  ? "Run Calculate to compute what every in-scope coach is owed."
                  : "No coaches were in scope for this period."
              }
              title="Nothing calculated yet"
            />
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table className="w-full min-w-[760px] border-collapse">
                  <TableHeader>
                    <TableRow className="border-b border-app-border">
                      {([["Coach", "coach"], ["Classes", "classes"], ["Hours", "hours"], ["Gross", "gross"], ["Net", "net"], ["Status", "status"], ["", null]] as const).map(([heading, sortKey]) => (
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
                    {sortedRecords.map((record) => (
                      <Fragment key={record.id}>
                        <TableRow
                          className="cursor-pointer border-b border-app-border last:border-0 hover:bg-app-soft/60"
                          onClick={() => setExpanded(expanded === record.id ? null : record.id)}
                        >
                          <TableCell className="text-left px-4 py-3">
                            <p className="text-sm font-semibold text-app-text">{record.coachName}</p>
                            <p className="text-xs text-app-muted">{record.coachEmail}</p>
                          </TableCell>
                          <TableCell className="text-left px-4 py-3 text-sm text-app-muted">
                            {record.completedClassesCount}/{record.scheduledClassesCount}
                          </TableCell>
                          <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-muted">
                            {(record.totalTeachingSeconds / 3600).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-text">
                            {formatMoney(record.grossEarningsMinor, currency)}
                          </TableCell>
                          <TableCell className="text-left px-4 py-3 text-sm font-semibold tabular-nums text-primary-ink">
                            {formatMoney(record.netPayableMinor, currency)}
                          </TableCell>
                          <TableCell className="text-left px-4 py-3">
                            <PayrollRecordStatusBadge status={record.status} />
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            {/* The keyboard / screen-reader way in; the row click stays for the mouse. */}
                            <button
                              aria-controls={`payroll-record-${record.id}`}
                              aria-expanded={expanded === record.id}
                              aria-label={`${expanded === record.id ? "Hide" : "Show"} breakdown for ${record.coachName}`}
                              className="ml-auto grid size-8 place-items-center rounded-full text-app-muted transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpanded(expanded === record.id ? null : record.id);
                              }}
                              type="button"
                            >
                              {expanded === record.id ? (
                                <ChevronDown aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              ) : (
                                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              )}
                            </button>
                          </TableCell>
                        </TableRow>
                        {expanded === record.id ? (
                          <TableRow>
                            <TableCell className="text-left p-0" colSpan={7} id={`payroll-record-${record.id}`}>
                              <PayrollRecordDetailPanel
                                payout={payoutsByRecord.get(record.id)}
                                record={record}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      ) : null}
      <Dialog onOpenChange={setCancelling} open={cancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this payroll period?</DialogTitle>
            <DialogDescription>
              Its calculated records are kept for the record, but nobody is paid from it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="payroll-cancel-reason">Reason (optional)</Label>
            <Textarea
              id="payroll-cancel-reason"
              maxLength={1000}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              value={cancelReason}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setCancelling(false)} type="button" variant="outline">
              Keep period
            </Button>
            <Button
              onClick={() => {
                setCancelling(false);
                void runPeriodAction({ kind: "cancel", reason: cancelReason.trim() });
              }}
              type="button"
              variant="destructive"
            >
              Cancel period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
