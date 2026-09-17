"use client";

import { useState } from "react";
import { Plus, RotateCw, Undo2 } from "lucide-react";
import { formatMoney, type CoachPayoutItem, type CoachPayrollRecordItem } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  usePayrollAdjustments,
  useRecalculatePayrollRecord
} from "../hooks/usePayrollApi";
import { AdjustmentDialog } from "./AdjustmentDialog";
import { PayoutSection } from "./PayoutSection";
import { ReverseAdjustmentDialog } from "./ReverseAdjustmentDialog";

const ADJUSTABLE_STATUSES = new Set(["CALCULATED", "APPROVED"]);

/**
 * The expanded view of one coach's row (§10/§11): a full, explainable
 * calculation breakdown, the manual adjustments on top of it, and payout
 * tracking — never just a final number.
 */
export function PayrollRecordDetailPanel({
  record,
  payout
}: {
  record: CoachPayrollRecordItem;
  payout: CoachPayoutItem | undefined;
}) {
  const timeZone = useUserTimeZone();
  const { data: adjustments } = usePayrollAdjustments(record.id);
  const recalculate = useRecalculatePayrollRecord();
  const [addingAdjustment, setAddingAdjustment] = useState(false);
  const [reversing, setReversing] = useState<{ id: string; description: string } | null>(null);

  const currency = "INR";
  const lineItems = record.earningsBreakdown?.lineItems ?? [];
  const canAdjust = ADJUSTABLE_STATUSES.has(record.status);

  return (
    <div className="space-y-4 border-t border-app-border bg-app-soft/40 p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-app-muted">
              Calculation breakdown
            </h4>
            {record.status === "CALCULATED" ? (
              <Button
                isLoading={recalculate.isPending}
                onClick={() => recalculate.mutate(record.id)}
                size="sm"
                variant="outline"
              >
                <RotateCw className="mr-1.5 size-4" strokeWidth={2.5} />
                Recalculate
              </Button>
            ) : null}
          </div>

          {lineItems.length === 0 ? (
            <p className="text-sm text-app-muted">No teaching activity in this period.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {lineItems.map((item, index) => (
                  <tr className="border-b border-app-border last:border-0" key={index}>
                    <td className="py-1.5 pr-2 text-app-text">
                      {item.label}
                      {item.quantity !== undefined ? (
                        <span className="text-app-muted"> × {item.quantity}</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-app-text">
                      {formatMoney(item.amountMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-app-muted">Gross earnings</dt>
              <dd className="font-semibold tabular-nums text-app-text">
                {formatMoney(record.grossEarningsMinor, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-app-muted">Deductions</dt>
              <dd className="tabular-nums text-app-text">
                -{formatMoney(record.totalDeductionsMinor, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-app-muted">Adjustments</dt>
              <dd className="tabular-nums text-app-text">
                {record.totalAdjustmentsMinor >= 0 ? "+" : ""}
                {formatMoney(record.totalAdjustmentsMinor, currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-app-border pt-1 text-base">
              <dt className="font-bold text-app-text">Net payable</dt>
              <dd className="font-bold tabular-nums text-primary">
                {formatMoney(record.netPayableMinor, currency)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <PayoutSection currency={currency} payout={payout} record={record} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-app-muted">
            Manual adjustments
          </h4>
          {canAdjust ? (
            <Button onClick={() => setAddingAdjustment(true)} size="sm" variant="outline">
              <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
              Add adjustment
            </Button>
          ) : null}
        </div>

        {!adjustments || adjustments.adjustments.length === 0 ? (
          <p className="text-sm text-app-muted">No manual adjustments.</p>
        ) : (
          <ul className="space-y-2">
            {adjustments.adjustments.map((adjustment) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-app-border bg-app-surface px-3 py-2 text-sm"
                key={adjustment.id}
              >
                <div>
                  <p className={adjustment.reversedAt ? "text-app-muted line-through" : "text-app-text"}>
                    {adjustment.description} — {formatMoney(adjustment.amountMinor, currency)}{" "}
                    <span className="text-xs text-app-muted">({adjustment.type.toLowerCase()})</span>
                  </p>
                  <p className="text-xs text-app-muted">
                    {adjustment.reason} · {formatDateTime(adjustment.createdAt, timeZone)}
                  </p>
                  {adjustment.reversedAt ? (
                    <p className="text-xs text-app-danger-ink">
                      Reversed: {adjustment.reversalReason}
                    </p>
                  ) : null}
                </div>
                {!adjustment.reversedAt && canAdjust ? (
                  <Button
                    onClick={() =>
                      setReversing({ id: adjustment.id, description: adjustment.description })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Undo2 className="mr-1 size-3.5" strokeWidth={2.5} />
                    Reverse
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {addingAdjustment ? (
        <AdjustmentDialog
          coachName={record.coachName}
          currency={currency}
          onClose={() => setAddingAdjustment(false)}
          recordId={record.id}
        />
      ) : null}

      {reversing ? (
        <ReverseAdjustmentDialog
          adjustmentId={reversing.id}
          description={reversing.description}
          onClose={() => setReversing(null)}
          recordId={record.id}
        />
      ) : null}
    </div>
  );
}
