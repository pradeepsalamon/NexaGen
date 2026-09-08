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

function showToast({ action, durationMs, message, title, type }: ToastInput) {
  const options = {
    action,
    description: message,
    duration: durationMs ?? getDefaultDuration(type)
  };

  switch (type) {
    case "error":
      sonnerToast.error(title, options);
      break;
    case "warning":
      sonnerToast.warning(title, options);
      break;
    case "info":
      sonnerToast.info(title, options);
      break;
    case "loading":
      sonnerToast.loading(title, options);
      break;
    case "success":
      sonnerToast.success(title, options);
      break;
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
        const timer = setTimeout(() => {
          committed = true;
          onCommit();
        }, duration);
        showToast({
          action: {
            label: actionLabel ?? "Undo",
            onClick: () => {
              if (committed) return;
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
