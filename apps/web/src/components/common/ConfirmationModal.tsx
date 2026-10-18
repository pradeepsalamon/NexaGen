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
import { cn } from "@/lib/utils";

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

const PILL =
  "inline-flex h-10 min-w-[108px] items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-60";

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
          <span className="flex size-14 items-center justify-center rounded-full bg-app-danger/10 text-app-danger">
            <Icon aria-hidden="true" className="size-6" strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="space-y-2">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {children ? <AlertDialogDescription>{children}</AlertDialogDescription> : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <AlertDialogCancel
            className={cn(
              PILL,
              "border border-b-2 border-primary-ink bg-app-surface text-primary-ink hover:bg-primary/10"
            )}
            disabled={isConfirming}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              PILL,
              "bg-app-danger text-white shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--color-danger)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,black)]"
            )}
            disabled={isConfirming}
            onClick={(event) => {
              // Keep the dialog open while the action runs; the caller closes it.
              event.preventDefault();
              onConfirm();
            }}
          >
            {isConfirming ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
            ) : null}
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
