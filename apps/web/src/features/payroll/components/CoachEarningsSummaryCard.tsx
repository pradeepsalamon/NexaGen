"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMyPayrollRecords } from "../hooks/usePayrollApi";

const FINAL_STATUSES = new Set(["FINALIZED", "PAID"]);

/** Coach dashboard widget (§18/§19): a clearly-labeled estimate plus the last paid amount. */
export function CoachEarningsSummaryCard() {
  const { data } = useMyPayrollRecords();
  const records = data?.records ?? [];

  if (records.length === 0) return null;

  const current = records.find((r) => !FINAL_STATUSES.has(r.status));
  const lastFinal = records.find((r) => FINAL_STATUSES.has(r.status));

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-control border border-app-border bg-primary/[0.12] text-primary-ink">
          <Wallet className="size-4" strokeWidth={2.5} />
        </span>
        <h3 className="text-sm font-bold text-app-text">Earnings</h3>
      </div>

      {current ? (
        <div>
          <p className="text-2xl font-bold text-app-text">
            {formatMoney(current.netPayableMinor, "INR")}
          </p>
          <p className="text-xs text-app-muted">Estimated, not final — this period is still in review.</p>
        </div>
      ) : null}

      {lastFinal ? (
        <div>
          <p className="text-xs text-app-muted">Last payment</p>
          <p className="text-lg font-semibold text-app-text">
            {formatMoney(lastFinal.netPayableMinor, "INR")}
          </p>
        </div>
      ) : null}

      <Button asChild size="sm" variant="outline">
        <Link href="/coach/earnings">View earnings</Link>
      </Button>
    </Card>
  );
}
