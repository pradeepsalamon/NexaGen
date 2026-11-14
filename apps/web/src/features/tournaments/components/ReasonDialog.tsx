"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";

/**
 * Asks for a reason before a recorded action (cancel, disqualify, correct a
 * result, hide commentary, revoke a certificate). The reason goes into the
 * tournament's audit log.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  minLength = 3,
  optional = false,
  busy = false,
  children,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  minLength?: number;
  optional?: boolean;
  busy?: boolean;
  /** Extra fields above the reason (e.g. the result to record). */
  children?: ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const tooShort = !optional && reason.trim().length < minLength;
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="px-6 sm:pl-0">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort) onConfirm(reason.trim());
          }}
        >
          {children}
          <FormField hint={optional ? "Optional." : "Recorded in the tournament's audit log."} id="tournament-reason" label="Reason">
            <Textarea id="tournament-reason" maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} value={reason} />
          </FormField>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="neutral">
              Cancel
            </Button>
            <Button disabled={tooShort} isLoading={busy} type="submit" variant={destructive ? "destructive" : "primary"}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
