"use client";

import { useState } from "react";
import { Check, ExternalLink, Pencil, Plus, X } from "lucide-react";
import {
  formatMoney,
  type ManualPaymentRecordItem,
  type ManualPaymentReviewStatus,
  type OfflinePaymentMethodItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
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
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { manualPaymentAttachmentUrl } from "../api/paymentsApi";
import {
  useAdminManualPayments,
  useAdminOfflineMethods,
  useApproveManualPayment,
  useCreateOfflineMethod,
  useRejectManualPayment,
  useUpdateOfflineMethod
} from "../hooks/usePaymentsApi";
import { RecordManualPaymentDialog } from "./RecordManualPaymentDialog";

const STATUS_VARIANT: Record<
  ManualPaymentReviewStatus,
  "warning" | "success" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive"
};

/**
 * Cash / personal UPI-GPay / bank transfer, recorded by an admin or a coach
 * for tracking. A coach's entry sits PENDING here until approved — approving
 * it runs the same PAID funnel a gateway capture does, so it produces the
 * same entitlement, invoice and receipt.
 */
export function ManualPaymentsPanel() {
  const timeZone = useUserTimeZone();
  const [status, setStatus] = useState<ManualPaymentReviewStatus | "">("PENDING");
  const [recording, setRecording] = useState(false);
  const [rejecting, setRejecting] = useState<ManualPaymentRecordItem | null>(null);

  const { data, isLoading } = useAdminManualPayments(status || undefined);
  const approve = useApproveManualPayment();

  const records = data?.records ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-36">
          <Select
            aria-label="Filter by status"
            onChange={(event) =>
              setStatus(event.target.value as ManualPaymentReviewStatus | "")
            }
            options={[
              { label: "Pending", value: "PENDING" },
              { label: "Approved", value: "APPROVED" },
              { label: "Rejected", value: "REJECTED" }
            ]}
            placeholder="All statuses"
            value={status}
          />
        </div>
        <Button onClick={() => setRecording(true)} type="button" variant="primary">
          <Plus className="size-4" strokeWidth={2.5} />
          Record a payment
        </Button>
      </div>

      {recording ? (
        <RecordManualPaymentDialog onClose={() => setRecording(false)} scope="admin" />
      ) : null}
      {rejecting ? (
        <RejectManualPaymentDialog
          onClose={() => setRejecting(null)}
          record={rejecting}
        />
      ) : null}

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : records.length === 0 ? (
        <EmptyState
          description="Cash, personal UPI/GPay and bank transfer payments recorded by admins and coaches show up here."
          title="No manual payments"
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-app-border bg-app-soft text-left">
                <tr className="text-xs uppercase tracking-wide text-app-muted">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Recorded by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    className="border-b border-app-border last:border-b-0"
                    key={record.id}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-app-muted">
                      {formatDateTime(record.createdAt, timeZone)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-app-text">
                        {record.studentName ?? "—"}
                      </span>
                      <span className="block font-mono text-xs text-app-muted">
                        {record.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-app-muted">
                      {record.planName}
                      {record.batchName ? (
                        <span className="block text-xs">{record.batchName}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-app-text">
                      {formatMoney(record.amount, record.currency)}
                    </td>
                    <td className="px-4 py-3 text-app-muted">
                      {record.methodLabel}
                      {record.reference ? (
                        <span className="block text-xs">{record.reference}</span>
                      ) : null}
                      {record.hasAttachment ? (
                        <a
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          href={manualPaymentAttachmentUrl(record.id)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          View proof <ExternalLink className="size-3" strokeWidth={2.5} />
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-app-muted">
                      {record.recordedByName ?? "—"}
                      <span className="block text-xs capitalize">
                        {record.recordedByRole.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[record.status]}>
                        {record.status === "PENDING"
                          ? "Pending"
                          : record.status === "APPROVED"
                            ? "Approved"
                            : "Rejected"}
                      </Badge>
                      {record.status === "REJECTED" && record.rejectionReason ? (
                        <span className="block text-xs text-app-muted">
                          {record.rejectionReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {record.status === "PENDING" ? (
                        <div className="flex justify-end gap-1.5">
                          <SimpleTooltip label="Approve — grants access">
                            <Button
                              aria-label={`Approve payment for ${record.studentName ?? "student"}`}
                              className="size-8 rounded-full border-accent p-0 hover:bg-accent hover:text-white"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate(record.id)}
                              size="icon"
                              type="button"
                              variant="outline"
                            >
                              <Check className="size-3.5" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip label="Reject">
                            <Button
                              aria-label={`Reject payment for ${record.studentName ?? "student"}`}
                              className="size-8 rounded-full border-app-danger p-0 hover:bg-app-danger hover:text-white"
                              onClick={() => setRejecting(record)}
                              size="icon"
                              type="button"
                              variant="outline"
                            >
                              <X className="size-3.5" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <OfflineMethodsSection />
    </div>
  );
}

function RejectManualPaymentDialog({
  record,
  onClose
}: {
  record: ManualPaymentRecordItem;
  onClose: () => void;
}) {
  const reject = useRejectManualPayment();
  const [reason, setReason] = useState("");

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this payment</DialogTitle>
          <DialogDescription>
            {record.studentName ?? "This student"} will not get access from this
            record. The coach who submitted it can see the reason.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this being rejected?"
            rows={3}
            value={reason}
          />
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!reason.trim()}
            isLoading={reject.isPending}
            onClick={() =>
              reject.mutate(
                { id: record.id, reason: reason.trim() },
                { onSuccess: onClose }
              )
            }
            type="button"
            variant="destructive"
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The admin-configurable catalogue of offline methods (Cash, UPI/GPay, …). */
function OfflineMethodsSection() {
  const { data, isLoading } = useAdminOfflineMethods();
  const update = useUpdateOfflineMethod();
  const [editing, setEditing] = useState<OfflinePaymentMethodItem | null>(null);
  const [creating, setCreating] = useState(false);

  const methods = data?.methods ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-app-text">Offline payment methods</h3>
        <Button onClick={() => setCreating(true)} type="button" variant="outline">
          <Plus className="size-4" strokeWidth={2.5} />
          Add method
        </Button>
      </div>

      {creating || editing ? (
        <OfflineMethodForm
          method={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="divide-y divide-app-border p-0">
          {methods.map((method) => (
            <div
              className="flex items-center justify-between gap-3 px-4 py-2.5"
              key={method.id}
            >
              <span className="flex items-center gap-2 text-sm text-app-text">
                {method.label}
                {!method.isActive ? (
                  <Badge variant="secondary">Inactive</Badge>
                ) : null}
              </span>
              <div className="flex gap-1.5">
                <SimpleTooltip label="Edit">
                  <Button
                    aria-label={`Edit ${method.label}`}
                    className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                    onClick={() => setEditing(method)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-3.5" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip
                  label={method.isActive ? "Deactivate" : "Reactivate"}
                >
                  <Button
                    aria-label={`${method.isActive ? "Deactivate" : "Reactivate"} ${method.label}`}
                    className="size-8 rounded-full border-app-border p-0 hover:bg-app-soft"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: method.id,
                        data: { isActive: !method.isActive }
                      })
                    }
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    {method.isActive ? (
                      <X className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    )}
                  </Button>
                </SimpleTooltip>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function OfflineMethodForm({
  method,
  onClose
}: {
  method: OfflinePaymentMethodItem | null;
  onClose: () => void;
}) {
  const create = useCreateOfflineMethod();
  const update = useUpdateOfflineMethod();
  const [label, setLabel] = useState(method?.label ?? "");

  const pending = create.isPending || update.isPending;

  const handleSubmit = () => {
    if (method) {
      update.mutate(
        { id: method.id, data: { label: label.trim() } },
        { onSuccess: onClose }
      );
    } else {
      create.mutate(
        { label: label.trim(), sortOrder: 0 },
        { onSuccess: onClose }
      );
    }
  };

  return (
    <Card className="space-y-3 border-primary p-4">
      <div>
        <Label htmlFor="method-label">Name</Label>
        <Input
          id="method-label"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Paytm, PhonePe"
          value={label}
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!label.trim()}
          isLoading={pending}
          onClick={handleSubmit}
          type="button"
          variant="primary"
        >
          {method ? "Save" : "Add"}
        </Button>
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </Card>
  );
}
