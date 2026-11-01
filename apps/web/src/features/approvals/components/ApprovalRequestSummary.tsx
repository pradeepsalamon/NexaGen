"use client";

import { AlertTriangle } from "lucide-react";
import type { ApprovalRequestDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatRelativeDay } from "@/lib/datetime";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";

/** One request's facts, shared by the admin inbox and the coach's own list. */
export function ApprovalRequestSummary({
  request,
  showRequester
}: {
  request: ApprovalRequestDto;
  showRequester: boolean;
}) {
  const tz = useUserTimeZone();
  const subject = [request.classTitle, request.batchName, request.subjectUserName].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-app-text">{request.actionLabel}</span>
        <ApprovalStatusBadge status={request.status} />
        {request.urgent && request.status === "PENDING" ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle aria-hidden="true" className="size-3" strokeWidth={2.5} />
            Urgent
          </Badge>
        ) : null}
      </div>
      {subject ? <p className="text-sm text-app-text">{subject}</p> : null}
      <p className="text-sm text-app-muted">
        {showRequester ? `${request.requesterName ?? "Former user"} · ` : ""}
        asked {formatRelativeDay(request.createdAt, tz).toLowerCase()}
        {request.status === "PENDING" ? ` · expires ${formatDateTime(request.expiresAt, tz)}` : ""}
      </p>
      <p className="text-sm text-app-text">“{request.reason}”</p>
      {request.status === "REJECTED" && request.rejectionReason ? (
        <p className="text-sm text-app-muted">
          {request.reviewerName ?? "Admin"}: {request.rejectionReason}
        </p>
      ) : null}
      {request.status === "APPROVED" && request.reviewerName ? (
        <p className="text-sm text-app-muted">Approved by {request.reviewerName}</p>
      ) : null}
    </div>
  );
}
