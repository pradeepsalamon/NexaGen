"use client";

import { Inbox, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
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
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Things you asked an admin for, such as an extra class, a reschedule, cancelling a class within 24 hours or bringing in a student from outside your batches."
        title="My requests"
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-app" />
          <Skeleton className="h-24 rounded-app" />
        </div>
      ) : isError && !data ? (
        <WidgetError message="Couldn't load your requests. Check your connection and try again." onRetry={() => void refetch()} />
      ) : requests.length === 0 ? (
        <EmptyState
          description="When something needs an admin's approval, you'll be offered a request instead."
          icon={Inbox}
          title="No requests yet"
        />
      ) : (
        <ul className="divide-y divide-app-border rounded-app border border-app-border bg-app-surface shadow-card">
          {requests.map((r) => (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between" key={r.id}>
              <ApprovalRequestSummary request={r} showRequester={false} />
              {r.status === "PENDING" ? (
                <RowActions
                  actions={[{ ariaLabel: "Withdraw request", icon: Undo2, label: "Withdraw request", onSelect: () => withdraw(r.id) }]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
