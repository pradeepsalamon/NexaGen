"use client";

import { AlertTriangle } from "lucide-react";
import { readApprovalRequestedChange, readClassTimeValue, type ApprovalRequestDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatRelativeDay, formatTime } from "@/lib/datetime";
import { enumLabel } from "@/lib/utils";
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
      <ClassTimeChange request={request} />
      <RequestedChange request={request} />
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

/** What the request would change, for the kinds whose summary line alone doesn't say. */
function RequestedChange({ request }: { request: ApprovalRequestDto }) {
  const change = readApprovalRequestedChange(request.requestedValue);
  const current = (request.currentValue ?? {}) as { lockedValue?: string; status?: string | null };
  const text = (() => {
    switch (request.actionType) {
      case "ATTENDANCE_CORRECTION":
        return `Attendance: ${current.status ? enumLabel(current.status) : "no record"} → ${enumLabel(change.status ?? "")}`;
      case "BATCH_STUDENT_TRANSFER":
        return `Move from ${change.fromBatchName ?? "this batch"} to ${change.toBatchName ?? "another batch"}`;
      case "CLASS_SUBSTITUTE_COACH":
        return `${change.substituteName ?? "Another coach"} would take this class`;
      case "LIVE_SETTING_EXCEPTION":
        return `${change.fieldLabel ?? "Setting"}: ${enumLabel(current.lockedValue ?? "")} → ${enumLabel(change.value ?? "")}, this class only`;
      default:
        return null;
    }
  })();
  return text ? <p className="text-sm text-app-text">{text}</p> : null;
}

/**
 * Extra-class and reschedule requests: the asked-for time, with the class's
 * time when the coach asked struck through for a reschedule.
 */
function ClassTimeChange({ request }: { request: ApprovalRequestDto }) {
  const tz = useUserTimeZone();
  if (request.actionType !== "CLASS_EXTRA" && request.actionType !== "CLASS_RESCHEDULE") return null;
  const requested = readClassTimeValue(request.requestedValue);
  if (!requested) return null;
  const current = request.actionType === "CLASS_RESCHEDULE" ? readClassTimeValue(request.currentValue) : null;
  return (
    <p className="text-sm text-app-text">
      {current ? (
        <>
          <span className="text-app-muted line-through">{formatDateTime(current.startsAt, tz)}</span>
          {" → "}
        </>
      ) : null}
      {formatDateTime(requested.startsAt, tz)} – {formatTime(requested.endsAt, tz)}
      {requested.topic ? ` · ${requested.topic}` : ""}
    </p>
  );
}
