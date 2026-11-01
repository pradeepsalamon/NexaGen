"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Inbox, X } from "lucide-react";
import type { ApprovalRequestDto, ApprovalStatus } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { approveApprovalRequest, rejectApprovalRequest } from "../api/approvalsApi";
import { APPROVAL_INVALIDATES, useApprovalRequests } from "../hooks/useApprovals";
import { ApprovalRequestSummary } from "./ApprovalRequestSummary";
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_OPTIONS } from "./ApprovalStatusBadge";

type Decision = { request: ApprovalRequestDto; approve: boolean };

const APPROVE_EFFECT: Record<string, string> = {
  CLASS_CANCEL: "This cancels the class and tells the batch.",
  CLASS_CANCEL_EXCEPTIONAL: "This marks the class cancelled. A running class must be ended first.",
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Requests</h1>
          <p className="mt-1 text-app-muted">
            Coaches ask here for things beyond their own authority, like cancelling a class within 24 hours.
          </p>
        </div>
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
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-app" />
          <Skeleton className="h-24 w-full rounded-app" />
        </div>
      ) : isError && !data ? (
        <WidgetError message="Couldn't load requests." onRetry={() => void refetch()} />
      ) : requests.length === 0 ? (
        <Card>
          <EmptyState
            variant="inline"
            icon={Inbox}
            title={status === "PENDING" ? "Nothing waiting" : "No requests"}
            description="Requests from coaches appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            // Never your own request (the API refuses it too).
            const canDecide = r.status === "PENDING" && r.requesterId !== me?.id;
            return (
              <Card
                key={r.id}
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                  highlight === r.id && "ring-2 ring-primary"
                )}
              >
                <ApprovalRequestSummary request={r} showRequester />
                {canDecide ? (
                  <div className="flex shrink-0 gap-2">
                    <SimpleTooltip label="Approve">
                      <Button
                        aria-label="Approve request"
                        className="size-8 rounded-full border border-accent bg-accent p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:text-white"
                        onClick={() => {
                          setText("");
                          setDeciding({ request: r, approve: true });
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </SimpleTooltip>
                    <SimpleTooltip label="Reject">
                      <Button
                        aria-label="Reject request"
                        className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                        onClick={() => {
                          setText("");
                          setDeciding({ request: r, approve: false });
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </SimpleTooltip>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
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
            <Button type="button" variant="outline" onClick={() => setDeciding(null)}>
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
