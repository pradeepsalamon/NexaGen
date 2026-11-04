"use client";

import { type ReactNode, useState } from "react";
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

type Props = {
  confirmLabel: string;
  description: ReactNode;
  /** Extra fields above the reason (e.g. a status or date picker). */
  children?: ReactNode;
  isPending: boolean;
  label?: string;
  minLength?: number;
  onClose: () => void;
  /** Resolve to close; reject keeps the dialog open (the API toast explains). */
  onConfirm: (reason: string) => Promise<unknown>;
  title: string;
  variant?: "destructive" | "primary";
};

/** A console action that needs a written reason: it goes to the platform audit log. */
export function ReasonDialog({
  children,
  confirmLabel,
  description,
  isPending,
  label = "Reason",
  minLength = 3,
  onClose,
  onConfirm,
  title,
  variant = "primary"
}: Props) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <FormField hint="Saved in the platform audit log." id="platform-reason" label={label} required>
          <Textarea
            id="platform-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            value={reason}
          />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={trimmed.length < minLength}
            isLoading={isPending}
            onClick={() => {
              onConfirm(trimmed).then(onClose, () => undefined);
            }}
            type="button"
            variant={variant}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
