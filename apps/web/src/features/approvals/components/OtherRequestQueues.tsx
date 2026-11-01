"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OtherRequestQueue, OtherRequestQueueKind } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";
import { useOtherRequestQueues } from "../hooks/useApprovals";

/** Where each queue is decided; the API lists only queues the viewer may review there. */
const QUEUE_PAGES: Record<OtherRequestQueueKind, string> = {
  ACCOUNT_DELETION: "/admin/privacy",
  COACH_APPLICATION: "/admin/approvals?tab=coaches",
  MANUAL_PAYMENT: "/admin/payments?tab=manual"
};

/**
 * The review queues that keep their own pages (offline payments, account
 * deletions, coach applications), shown in the request inbox so nothing waits
 * unseen (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md Stage 5). Read-only:
 * each item is decided on its own page. Only queues with something waiting show.
 */
export function OtherRequestQueues() {
  const { data } = useOtherRequestQueues();
  const waiting = (data?.queues ?? []).filter((q) => q.pendingCount > 0);
  if (waiting.length === 0) return null;

  return (
    <section aria-labelledby="other-queues-heading" className="space-y-3">
      <h2 id="other-queues-heading" className="text-lg font-bold text-app-text">
        Also waiting for review
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {waiting.map((queue) => (
          <QueueCard key={queue.kind} queue={queue} />
        ))}
      </div>
    </section>
  );
}

function QueueCard({ queue }: { queue: OtherRequestQueue }) {
  const tz = useUserTimeZone();
  const more = queue.pendingCount - queue.items.length;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-app-text">{queue.label}</span>
        <Badge variant="warning">{queue.pendingCount}</Badge>
      </div>
      <ul className="space-y-2">
        {queue.items.map((item) => (
          <li key={item.id} className="min-w-0 text-sm">
            <p className="truncate text-app-text">{item.title}</p>
            <p className="truncate text-app-muted">
              {[item.subtitle, formatRelativeDay(item.createdAt, tz)].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="text-sm text-app-muted">and {more} more</p> : null}
      <div className="mt-auto">
        <Button asChild size="sm" variant="outline">
          <Link href={QUEUE_PAGES[queue.kind]}>
            Review
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
