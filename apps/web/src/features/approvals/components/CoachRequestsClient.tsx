"use client";

import { Inbox, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cancelApprovalRequest } from "../api/approvalsApi";
import { APPROVAL_INVALIDATES, useMyApprovalRequests } from "../hooks/useApprovals";
import { ApprovalRequestSummary } from "./ApprovalRequestSummary";

/** A coach's own admin requests, newest first; a waiting one can be withdrawn. */
export function CoachRequestsClient() {
  const { data, isError, isLoading, refetch } = useMyApprovalRequests();

  const { run: withdraw } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (id: string) => cancelApprovalRequest(id),
    undo: async () => {},
    toast: () => ({ title: "Withdrawing your request" }),
    invalidates: APPROVAL_INVALIDATES
  });

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">My requests</h1>
        <p className="mt-1 text-app-muted">
          Things you asked an admin for, such as an extra class, a reschedule, cancelling a class within 24
          hours or bringing in a student from outside your batches.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-app" />
          <Skeleton className="h-24 w-full rounded-app" />
        </div>
      ) : isError && !data ? (
        <WidgetError message="Couldn't load your requests." onRetry={() => void refetch()} />
      ) : requests.length === 0 ? (
        <Card>
          <EmptyState
            variant="inline"
            icon={Inbox}
            title="No requests yet"
            description="When something needs an admin's approval, you'll be offered a request instead."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <ApprovalRequestSummary request={r} showRequester={false} />
              {r.status === "PENDING" ? (
                <SimpleTooltip label="Withdraw request">
                  <Button
                    aria-label="Withdraw request"
                    className="shrink-0 rounded-full"
                    onClick={() => withdraw(r.id)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Undo2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
