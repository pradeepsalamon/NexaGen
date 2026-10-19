"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo
} from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/Toaster";

export type ToastType = "success" | "warning" | "error" | "info" | "loading";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastInput = {
  action?: ToastAction;
  durationMs?: number;
  message?: string;
  title: string;
  type: ToastType;
};

type PromiseInput = {
  error: string;
  loading: string;
  success: string;
};

type UndoableInput = {
  actionLabel?: string;
  delayMs?: number;
  message?: string;
  onCommit: () => void;
  /** Fired when the user clicks Undo before onCommit fires. */
  onUndo?: () => void;
  title: string;
};

type ToastContextValue = {
  dismissToast: (id: string | number) => void;
  error: (toast: Omit<ToastInput, "type">) => void;
  info: (toast: Omit<ToastInput, "type">) => void;
  loading: (toast: Omit<ToastInput, "type">) => void;
  promise: <T>(promise: Promise<T>, messages: PromiseInput) => void;
  showToast: (toast: ToastInput) => void;
  success: (toast: Omit<ToastInput, "type">) => void;
  undoable: (toast: UndoableInput) => void;
  warning: (toast: Omit<ToastInput, "type">) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function getDefaultDuration(type: ToastType): number {
  switch (type) {
    case "success":
      return 3000;
    case "info":
      return 4000;
    case "warning":
    case "error":
      return 8000;
    case "loading":
      return Number.POSITIVE_INFINITY;
  }
}

function showToast({ action, durationMs, message, title, type }: ToastInput): string | number {
  const options = {
    action,
    description: message,
    duration: durationMs ?? getDefaultDuration(type)
  };

  switch (type) {
    case "error":
      return sonnerToast.error(title, options);
    case "warning":
      return sonnerToast.warning(title, options);
    case "info":
      return sonnerToast.info(title, options);
    case "loading":
      return sonnerToast.loading(title, options);
    case "success":
      return sonnerToast.success(title, options);
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ToastContextValue>(
    () => ({
      dismissToast: (id) => sonnerToast.dismiss(id),
      error: (toast) => showToast({ ...toast, type: "error" }),
      info: (toast) => showToast({ ...toast, type: "info" }),
      loading: (toast) => showToast({ ...toast, type: "loading" }),
      promise: (promise, messages) => {
        sonnerToast.promise(promise, {
          error: messages.error,
          loading: messages.loading,
          success: messages.success
        });
      },
      showToast,
      success: (toast) => showToast({ ...toast, type: "success" }),
      undoable: ({ actionLabel, delayMs, message, onCommit, onUndo, title }) => {
        const duration = delayMs ?? 6000;
        let committed = false;
        let toastId: string | number | undefined;
        const timer = setTimeout(() => {
          committed = true;
          if (toastId !== undefined) sonnerToast.dismiss(toastId);
          onCommit();
        }, duration);
        toastId = showToast({
          action: {
            label: actionLabel ?? "Undo",
            onClick: () => {
              if (committed) {
                showToast({ title: "Too late to undo — the action was already applied.", type: "warning" });
                return;
              }
              clearTimeout(timer);
              onUndo?.();
            }
          },
          durationMs: duration,
          message,
          title,
          type: "info"
        });
      },
      warning: (toast) => showToast({ ...toast, type: "warning" })
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }

  return context;
}
