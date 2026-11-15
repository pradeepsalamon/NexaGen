"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
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
    <SectionCard
      actions={
        <Button asChild className="-mr-3" size="sm" variant="ghost">
          <Link href="/coach/requests">
            All my requests
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      }
      title="Waiting for an admin"
    >
      <ul className="divide-y divide-app-border">
        {waiting.slice(0, 6).map((r) => (
          <li className="py-3 first:pt-0 last:pb-0" key={r.id}>
            <ApprovalRequestSummary request={r} showRequester={false} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
