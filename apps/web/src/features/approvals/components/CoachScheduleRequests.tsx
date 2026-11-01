"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMyApprovalRequests } from "../hooks/useApprovals";
import { ApprovalRequestSummary } from "./ApprovalRequestSummary";

/**
 * On the coach's schedule: their scheduling requests still waiting for an admin
 * (extra classes, reschedules, cancellations). The full list, with withdraw,
 * is /coach/requests. Hidden when nothing is waiting.
 */
export function CoachScheduleRequests() {
  const { data } = useMyApprovalRequests();
  const waiting = (data?.requests ?? []).filter(
    (r) => r.status === "PENDING" && (r.category === "SCHEDULING" || r.actionType === "CLASS_SUBSTITUTE_COACH")
  );
  if (waiting.length === 0) return null;

  return (
    <section aria-labelledby="schedule-requests-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="schedule-requests-heading" className="text-xl font-bold text-app-text">
          Waiting for an admin
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link href="/coach/requests">
            All my requests
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {waiting.slice(0, 6).map((r) => (
          <Card key={r.id} className="p-4">
            <ApprovalRequestSummary request={r} showRequester={false} />
          </Card>
        ))}
      </div>
    </section>
  );
}
