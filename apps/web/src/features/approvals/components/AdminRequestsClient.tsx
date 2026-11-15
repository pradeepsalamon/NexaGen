"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Inbox, X } from "lucide-react";
import type { ApprovalRequestDto, ApprovalStatus } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { approveApprovalRequest, rejectApprovalRequest } from "../api/approvalsApi";
import { APPROVAL_INVALIDATES, useApprovalRequests } from "../hooks/useApprovals";
import { ApprovalRequestSummary } from "./ApprovalRequestSummary";
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_OPTIONS } from "./ApprovalStatusBadge";
import { OtherRequestQueues } from "./OtherRequestQueues";

type Decision = { request: ApprovalRequestDto; approve: boolean };

const APPROVE_EFFECT: Record<string, string> = {
  CLASS_CANCEL: "This cancels the class and tells the batch.",
  CLASS_CANCEL_EXCEPTIONAL: "This marks the class cancelled. A running class must be ended first.",
  CLASS_EXTRA: "This adds the class to the batch's schedule and tells its students.",
  CLASS_RESCHEDULE: "This moves the class to the new time.",
  LIVE_CLASS_GUEST_STUDENT: "The coach may then bring this student into this one class. If it's live, they're invited now."
};

/**
 * The admin inbox for coach requests (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §2.3). The API re-checks everything at decision time; a request whose state
 * changed stays waiting so it can be rejected.
 */
export function AdminRequestsClient() {
  const highlight = useSearchParams().get("id");
  const me = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<ApprovalStatus | "">("PENDING");
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [text, setText] = useState("");
  const { data, isError, isLoading, refetch } = useApprovalRequests(status || undefined);

  // Approval has no reverse endpoint, so the decision waits out the undo window.
  const { run: decide } = useUndoableMutation({
    strategy: "defer",
    mutationFn: ({ request, approve, text }: Decision & { text: string }) =>
      approve ? approveApprovalRequest(request.id, text || undefined) : rejectApprovalRequest(request.id, text),
    undo: async () => {},
    toast: ({ request, approve }) => ({
      title: `${approve ? "Approving" : "Rejecting"} ${request.requesterName ?? "the"}'s request`
    }),
    invalidates: APPROVAL_INVALIDATES
  });

  const requests = data?.requests ?? [];
  const rejectTooShort = deciding !== null && !deciding.approve && text.trim().length < 3;

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <PageHeader
        actions={
        <Select
          aria-label="Filter by status"
          className="w-full sm:w-48"
          value={status}
          onChange={(e) => setStatus(e.target.value as ApprovalStatus | "")}
          options={[
            { label: "All requests", value: "" },
            ...APPROVAL_STATUS_OPTIONS.map((s) => ({ label: APPROVAL_STATUS_LABELS[s], value: s }))
          ]}
        />
        }
        description="Coaches ask here for things beyond their own authority: schedule changes, a substitute, a student joining or leaving a batch, an attendance correction or a locked class setting."
        title="Requests"
      />

      <OtherRequestQueues />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-app" />
          <Skeleton className="h-24 rounded-app" />
        </div>
      ) : isError && !data ? (
        <WidgetError message="Couldn't load requests. Check your connection and try again." onRetry={() => void refetch()} />
      ) : requests.length === 0 ? (
        <EmptyState
          description="Requests from coaches appear here."
          icon={Inbox}
          title={status === "PENDING" ? "Nothing waiting" : "No requests"}
        />
      ) : (
        <ul className="divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
          {requests.map((r) => {
            // Never your own request (the API refuses it too).
            const canDecide = r.status === "PENDING" && r.requesterId !== me?.id;
            return (
              <li
                aria-current={highlight === r.id ? "true" : undefined}
                key={r.id}
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                  highlight === r.id && "bg-primary-soft"
                )}
              >
                <ApprovalRequestSummary request={r} showRequester />
                {canDecide ? (
                  <div className="flex shrink-0 justify-end gap-2">
                    <Button
                      aria-label="Reject request"
                      onClick={() => {
                        setText("");
                        setDeciding({ request: r, approve: false });
                      }}
                      size="sm"
                      type="button"
                      variant="neutral"
                    >
                      <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                      Reject
                    </Button>
                    <Button
                      aria-label="Approve request"
                      onClick={() => {
                        setText("");
                        setDeciding({ request: r, approve: true });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                      Approve
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={deciding !== null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deciding?.approve ? "Approve request" : "Reject request"}</DialogTitle>
            <DialogDescription>
              {deciding?.approve
                ? APPROVE_EFFECT[deciding.request.actionType] ?? "This carries out the request."
                : "The coach sees your reason."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={deciding?.approve ? "Note to the coach" : "Reason for rejecting"}
            maxLength={1000}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={deciding?.approve ? "Note to the coach (optional)" : "Why (the coach sees this)"}
          />
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              disabled={rejectTooShort}
              type="button"
              variant={deciding?.approve ? "primary" : "destructive"}
              onClick={() => {
                if (deciding) decide({ ...deciding, text: text.trim() });
                setDeciding(null);
              }}
            >
              {deciding?.approve ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
