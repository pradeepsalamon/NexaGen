"use client";

import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  X,
  type LucideIcon
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

export type ToastType = "success" | "warning" | "danger";

type ToastInput = {
  durationMs?: number;
  message?: string;
  title: string;
  type: ToastType;
};

type Toast = ToastInput & {
  id: string;
};

type ToastContextValue = {
  danger: (toast: Omit<ToastInput, "type">) => void;
  dismissToast: (id: string) => void;
  showToast: (toast: ToastInput) => void;
  success: (toast: Omit<ToastInput, "type">) => void;
  warning: (toast: Omit<ToastInput, "type">) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const DEFAULT_DURATION_MS = 4200;

const toastStyles: Record<
  ToastType,
  {
    accent: string;
    icon: LucideIcon;
  }
> = {
  danger: {
    accent: "text-app-danger",
    icon: CircleX
  },
  success: {
    accent: "text-accent",
    icon: CircleCheck
  },
  warning: {
    accent: "text-secondary",
    icon: TriangleAlert
  }
};

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id)
    );
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = createToastId();
      const nextToast = { ...toast, id };

      setToasts((currentToasts) => [nextToast, ...currentToasts].slice(0, 5));

      window.setTimeout(
        () => dismissToast(id),
        toast.durationMs ?? DEFAULT_DURATION_MS
      );
    },
    [dismissToast]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      danger: (toast) => showToast({ ...toast, type: "danger" }),
      dismissToast,
      showToast,
      success: (toast) => showToast({ ...toast, type: "success" }),
      warning: (toast) => showToast({ ...toast, type: "warning" })
    }),
    [dismissToast, showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="fixed right-4 top-4 z-[60] grid w-[min(380px,calc(100vw-32px))] gap-3"
      >
        {toasts.map((toast) => {
          const style = toastStyles[toast.type];
          const Icon = style.icon;

          return (
            <section
              className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-app border border-app-border bg-app-surface p-4 text-app-text shadow-soft"
              key={toast.id}
              role={toast.type === "danger" ? "alert" : "status"}
            >
              <Icon
                aria-hidden="true"
                className={`mt-0.5 size-5 ${style.accent}`}
                strokeWidth={2.5}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-5">
                  {toast.title}
                </p>
                {toast.message ? (
                  <p className="mt-1 text-sm leading-5 text-app-muted">
                    {toast.message}
                  </p>
                ) : null}
              </div>
              <button
                aria-label="Dismiss notification"
                className="inline-flex size-8 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text"
                onClick={() => dismissToast(toast.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </button>
            </section>
          );
        })}
      </div>
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
