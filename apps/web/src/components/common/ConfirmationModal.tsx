"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";

type ConfirmationModalProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  /** Shown in a tinted circle above the title. */
  icon?: LucideIcon;
  isConfirming?: boolean;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export function ConfirmationModal({
  cancelLabel = "Cancel",
  children,
  confirmLabel = "Confirm",
  icon: Icon,
  isConfirming = false,
  isOpen,
  onCancel,
  onConfirm,
  title
}: ConfirmationModalProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className="justify-items-center text-center">
        {Icon ? (
          <span className="flex size-10 items-center justify-center rounded-full bg-app-danger-soft text-app-danger-ink">
            <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="space-y-1">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {children ? <AlertDialogDescription>{children}</AlertDialogDescription> : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <AlertDialogCancel asChild>
            <Button disabled={isConfirming} variant="neutral">
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction
            asChild
            onClick={(event) => {
              // Keep the dialog open while the action runs; the caller closes it.
              event.preventDefault();
              onConfirm();
            }}
          >
            <Button isLoading={isConfirming} variant="destructive">
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
