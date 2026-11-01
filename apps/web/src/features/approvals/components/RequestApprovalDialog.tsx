"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApprovalActionType } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/providers/ToastProvider";
import { createApprovalRequest } from "../api/approvalsApi";
import { APPROVAL_INVALIDATES } from "../hooks/useApprovals";

/**
 * Asks an admin for something beyond the coach's own authority
 * (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md). The API decides whether
 * the request is valid; this only collects the reason, below any fields the
 * caller adds as `children`.
 */
export function RequestApprovalDialog({
  open,
  onOpenChange,
  actionType,
  payload,
  title,
  description,
  submitLabel = "Send request",
  canSubmit = true,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: ApprovalActionType;
  payload: Record<string, unknown>;
  title: string;
  description: string;
  submitLabel?: string;
  /** False while the caller's own fields are incomplete. */
  canSubmit?: boolean;
  children?: ReactNode;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => createApprovalRequest({ actionType, payload, reason: reason.trim() }),
    onSuccess: async () => {
      await Promise.all(APPROVAL_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success({ title: "Request sent", message: "An admin will review it. You'll be notified of the outcome." });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't send the request.")
  });

  const tooShort = reason.trim().length < 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="px-6 sm:pl-0">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <FormField error={error ?? undefined} id="approval-reason" label="Reason">
          <Textarea
            id="approval-reason"
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell the admin why"
            rows={3}
            value={reason}
          />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={tooShort || !canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            type="button"
            variant="primary"
          >
            {mutation.isPending ? "Sending…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
