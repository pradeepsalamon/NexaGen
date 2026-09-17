"use client";

import { useState } from "react";
import type { CoachPayoutItem, CoachPayrollRecordItem } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useCreatePayout } from "../hooks/usePayrollApi";
import { MarkPayoutPaidDialog } from "./MarkPayoutPaidDialog";
import { PayoutStatusBadge } from "./PayrollBadges";

const PAYABLE_STATUSES = new Set(["FINALIZED", "PAID"]);

type Props = {
  record: CoachPayrollRecordItem;
  payout: CoachPayoutItem | undefined;
  currency: string;
};

/** Payout tracking for one coach's finalized record (§22). */
export function PayoutSection({ record, payout, currency }: Props) {
  const timeZone = useUserTimeZone();
  const create = useCreatePayout();
  const [markingPaid, setMarkingPaid] = useState(false);

  if (!PAYABLE_STATUSES.has(record.status)) {
    return (
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-app-muted">Payout</h4>
        <p className="text-sm text-app-muted">Available once this record is finalized.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-app-muted">Payout</h4>

      {!payout ? (
        <Button
          isLoading={create.isPending}
          onClick={() => create.mutate({ payrollRecordId: record.id })}
          size="sm"
          variant="outline"
        >
          Create payout
        </Button>
      ) : (
        <div className="space-y-2 text-sm">
          <PayoutStatusBadge status={payout.status} />
          {payout.reference ? (
            <p className="text-app-muted">
              Ref: <span className="text-app-text">{payout.reference}</span>
            </p>
          ) : null}
          {payout.method ? <p className="text-app-muted">Method: {payout.method}</p> : null}
          {payout.paidAt ? (
            <p className="text-app-muted">Paid {formatFullDate(payout.paidAt, timeZone)}</p>
          ) : null}

          {payout.status === "PENDING" ? (
            <Button onClick={() => setMarkingPaid(true)} size="sm" variant="outline">
              Mark as paid manually
            </Button>
          ) : null}
        </div>
      )}

      {markingPaid && payout ? (
        <MarkPayoutPaidDialog
          amountMinor={record.netPayableMinor}
          currency={currency}
          onClose={() => setMarkingPaid(false)}
          payoutId={payout.id}
        />
      ) : null}
    </div>
  );
}
