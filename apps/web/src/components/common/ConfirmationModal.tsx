"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

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
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="confirmation-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <button
        aria-label="Close confirmation"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
        type="button"
      />
      <section className="relative grid w-full max-w-[420px] gap-5 rounded-panel border border-app-border bg-app-surface p-5 text-app-text shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-xl font-extrabold leading-tight"
              id="confirmation-modal-title"
            >
              {title}
            </h2>
            {children ? (
              <div className="mt-2 text-sm leading-6 text-app-muted">
                {children}
              </div>
            ) : null}
          </div>
          <button
            aria-label="Close confirmation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            className="border-[color-mix(in_srgb,var(--color-accent)_62%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_22%,var(--color-surface))] hover:bg-[color-mix(in_srgb,var(--color-accent)_32%,var(--color-surface))]"
            disabled={isConfirming}
            onClick={onCancel}
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          <Button
            className="border-transparent bg-app-danger text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-danger)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,black)]"
            isLoading={isConfirming}
            onClick={onConfirm}
            variant="primary"
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
