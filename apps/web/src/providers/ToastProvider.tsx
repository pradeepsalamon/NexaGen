"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo
} from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "../components/ui/sonner";

export type ToastType = "success" | "warning" | "danger";

type ToastInput = {
  durationMs?: number;
  message?: string;
  title: string;
  type: ToastType;
};

type ToastContextValue = {
  danger: (toast: Omit<ToastInput, "type">) => void;
  dismissToast: (id: string | number) => void;
  showToast: (toast: ToastInput) => void;
  success: (toast: Omit<ToastInput, "type">) => void;
  warning: (toast: Omit<ToastInput, "type">) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const DEFAULT_DURATION_MS = 5000;

function showToast({ durationMs, message, title, type }: ToastInput) {
  const options = {
    description: message,
    duration: durationMs ?? DEFAULT_DURATION_MS
  };

  if (type === "danger") {
    sonnerToast.error(title, options);
    return;
  }

  if (type === "warning") {
    sonnerToast.warning(title, options);
    return;
  }

  sonnerToast.success(title, options);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ToastContextValue>(
    () => ({
      danger: (toast) => showToast({ ...toast, type: "danger" }),
      dismissToast: (id) => sonnerToast.dismiss(id),
      showToast,
      success: (toast) => showToast({ ...toast, type: "success" }),
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
