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

/** Admin → Finance → Coach Payroll → Periods. */
export function AdminPayrollPeriodsPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminPayrollPeriods();
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
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-app-border">
                  {["Period", "Range", "Status", "Calculated", "Finalized", ""].map((heading) => (
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-app-muted"
                      key={heading}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.periods.map((period) => (
                  <tr className="border-b border-app-border last:border-0" key={period.id}>
                    <td className="px-4 py-3 text-sm font-semibold text-app-text">
                      {period.periodType}
                    </td>
                    <td className="px-4 py-3 text-sm text-app-muted">
                      {formatFullDate(period.startDate, "UTC")} – {formatFullDate(period.endDate, "UTC")}
                    </td>
                    <td className="px-4 py-3">
                      <PayrollPeriodStatusBadge status={period.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-app-muted">
                      {period.calculatedAt ? formatFullDate(period.calculatedAt, timeZone) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-app-muted">
                      {period.finalizedAt ? formatFullDate(period.finalizedAt, timeZone) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/finance/coach-payroll/periods/${period.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {creating ? <CreatePeriodDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
