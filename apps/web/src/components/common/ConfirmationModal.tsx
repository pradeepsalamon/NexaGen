"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";

type ConfirmationModalProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {children ? (
              <AlertDialogDescription className="mt-2">
                {children}
              </AlertDialogDescription>
            ) : null}
          </div>
          <AlertDialogCancel asChild>
            <Button
              aria-label="Close confirmation"
              className="text-app-muted shadow-none hover:text-app-text"
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </AlertDialogCancel>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              disabled={isConfirming}
              variant="primary"
            >
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              className="border-transparent bg-app-danger text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-danger)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,black)]"
              isLoading={isConfirming}
              onClick={onConfirm}
              variant="primary"
            >
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
