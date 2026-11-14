"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { formatMoney, type ManualPaymentReviewStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { manualPaymentAttachmentUrl } from "../api/paymentsApi";
import { useMyManualPayments } from "../hooks/usePaymentsApi";
import { RecordManualPaymentDialog } from "./RecordManualPaymentDialog";

const STATUS_VARIANT: Record<
  ManualPaymentReviewStatus,
  "warning" | "success" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive"
};

const STATUS_LABEL: Record<ManualPaymentReviewStatus, string> = {
  PENDING: "Awaiting admin approval",
  APPROVED: "Approved",
  REJECTED: "Rejected"
};

/**
 * Coach → Payments: record a cash / personal UPI-GPay / bank transfer payment
 * for a student in one of your own batches, and track what you've submitted.
 * A submission grants nothing by itself — an admin approves it before the
 * student gets access.
 */
export function CoachManualPaymentsClient() {
  const timeZone = useUserTimeZone();
  const [recording, setRecording] = useState(false);
  const { data, isLoading } = useMyManualPayments();

  const records = data?.records ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-text">Payments</h1>
          <p className="text-sm text-app-muted">
            Record a cash, personal UPI/GPay or bank transfer payment for a
            student in one of your batches. An admin approves it before the
            student gets access.
          </p>
        </div>
        <Button onClick={() => setRecording(true)} type="button" variant="primary">
          <Plus className="size-4" strokeWidth={2.5} />
          Record a payment
        </Button>
      </div>

      {recording ? (
        <RecordManualPaymentDialog onClose={() => setRecording(false)} scope="coach" />
      ) : null}

      {isLoading ? <Skeleton className="h-56 w-full" /> : null}

      {!isLoading && records.length === 0 ? (
        <EmptyState
          description="Payments you record for your students will show up here."
          title="No payments recorded yet"
        />
      ) : null}

      {records.length > 0 ? (
        <Card className="divide-y divide-app-border p-0">
          {records.map((record) => (
            <div className="space-y-1 px-4 py-3" key={record.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-app-text">
                  {record.studentName ?? "—"} · {record.planName}
                </span>
                <Badge variant={STATUS_VARIANT[record.status]}>
                  {STATUS_LABEL[record.status]}
                </Badge>
              </div>
              <p className="text-sm text-app-muted">
                {formatMoney(record.amount, record.currency)} via{" "}
                {record.methodLabel}
                {record.reference ? ` · ${record.reference}` : ""} ·{" "}
                {formatDateTime(record.createdAt, timeZone)}
              </p>
              {record.status === "REJECTED" && record.rejectionReason ? (
                <p className="text-xs text-app-danger-ink">
                  {record.rejectionReason}
                </p>
              ) : null}
              {record.hasAttachment ? (
                <a
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline"
                  href={manualPaymentAttachmentUrl(record.id)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View proof <ExternalLink className="size-3" strokeWidth={2.5} />
                </a>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
