"use client";

import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import {
  CLASS_REQUEST_STATUSES,
  CLASS_REQUEST_STATUS_LABELS,
  CLASS_REQUEST_TYPE_LABELS,
  type ClassChangeRequestDto,
  type ClassRequestStatus
} from "@nexa-chess/types";
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
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { approveClassRequest, rejectClassRequest } from "../api/classRequestsApi";
import { CLASS_REQUEST_INVALIDATES, useClassRequests } from "../hooks/useClassRequests";
import { ClassRequestStatusBadge } from "./ClassRequestStatusBadge";
import { ClassRequestWhen } from "./ClassRequestWhen";

type Decision = { request: ClassChangeRequestDto; approve: boolean };

export function AdminClassRequestsClient() {
  const tz = useUserTimeZone();
  const [status, setStatus] = useState<ClassRequestStatus | "">("PENDING");
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const { data, isLoading } = useClassRequests(status || undefined);

  // No reverse endpoint (an approval creates or moves a class), so the
  // decision is held for the undo window before it's sent.
  const { run: decide } = useUndoableMutation({
    strategy: "defer",
    mutationFn: ({ request, approve, note }: Decision & { note: string }) =>
      approve
        ? approveClassRequest(request.id, { note: note || undefined })
        : rejectClassRequest(request.id, { note: note || undefined }),
    undo: async () => {},
    toast: ({ request, approve }) => ({
      title: `${approve ? "Approving" : "Rejecting"} ${request.coachName}'s request`
    }),
    invalidates: CLASS_REQUEST_INVALIDATES
  });

  const openDecision = (request: ClassChangeRequestDto, approve: boolean) => {
    setNote("");
    setDeciding({ request, approve });
  };

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Class requests</h1>
          <p className="mt-1 text-app-muted">
            Coaches ask here for extra classes and new times. Approving creates or moves the class.
          </p>
        </div>
        <Select
          aria-label="Filter by status"
          className="w-full sm:w-48"
          value={status}
          onChange={(e) => setStatus(e.target.value as ClassRequestStatus | "")}
          options={[
            { label: "All requests", value: "" },
            ...CLASS_REQUEST_STATUSES.map((s) => ({ label: CLASS_REQUEST_STATUS_LABELS[s], value: s }))
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-app" />
          <Skeleton className="h-24 w-full rounded-app" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <EmptyState variant="inline"
            icon={Inbox}
            title={status === "PENDING" ? "Nothing waiting" : "No requests"}
            description="Requests from coaches appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-app-text">
                    {CLASS_REQUEST_TYPE_LABELS[r.type]} · {r.batchName}
                  </span>
                  <ClassRequestStatusBadge status={r.status} />
                </div>
                <ClassRequestWhen request={r} />
                <p className="text-sm text-app-muted">
                  {r.coachName} · asked {formatRelativeDay(r.createdAt, tz).toLowerCase()}
                  {r.topic ? ` · ${r.topic}` : ""}
                </p>
                {r.reason ? <p className="text-sm text-app-text">“{r.reason}”</p> : null}
                {r.reviewNote ? (
                  <p className="text-sm text-app-muted">
                    {r.reviewedByName ?? "Admin"}: {r.reviewNote}
                  </p>
                ) : null}
              </div>
              {r.status === "PENDING" ? (
                <div className="flex shrink-0 gap-2">
                  <SimpleTooltip label="Approve">
                    <Button
                      aria-label="Approve request"
                      className="size-8 rounded-full border border-accent bg-accent p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:text-white"
                      onClick={() => openDecision(r, true)}
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
                      onClick={() => openDecision(r, false)}
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
          ))}
        </div>
      )}

      <Dialog open={deciding !== null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deciding?.approve ? "Approve request" : "Reject request"}</DialogTitle>
            <DialogDescription>
              {deciding?.approve
                ? deciding.request.type === "EXTRA_CLASS"
                  ? "This adds the class to the batch's schedule and notifies the batch."
                  : "This moves the class to the requested time."
                : "The coach sees your note."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Note to the coach"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the coach (optional)"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={deciding?.approve ? "primary" : "destructive"}
              onClick={() => {
                if (deciding) decide({ ...deciding, note: note.trim() });
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
