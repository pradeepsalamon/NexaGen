"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "@/providers/ThemeProvider";

type ToasterProps = ComponentProps<typeof Sonner>;

// Same soft fill and ink as Alert. A neutral toast inverts the page, like a tooltip.
const toastColorVars = {
  "--error-bg": "rgb(var(--rgb-danger-soft))",
  "--error-border": "rgb(var(--rgb-danger) / 0.3)",
  "--error-text": "var(--color-danger-ink)",
  "--success-bg": "rgb(var(--rgb-success-soft))",
  "--success-border": "rgb(var(--rgb-success) / 0.3)",
  "--success-text": "var(--color-success-ink)",
  "--warning-bg": "rgb(var(--rgb-warning-soft))",
  "--warning-border": "rgb(var(--rgb-warning) / 0.3)",
  "--warning-text": "var(--color-warning-ink)",
  "--info-bg": "rgb(var(--rgb-info-soft))",
  "--info-border": "rgb(var(--rgb-info) / 0.3)",
  "--info-text": "var(--color-info-ink)",
  "--normal-bg": "rgb(var(--rgb-text))",
  "--normal-border": "rgb(var(--rgb-text-muted))",
  "--normal-text": "rgb(var(--rgb-surface))"
} as CSSProperties;

export function Toaster({ ...props }: ToasterProps) {
  const { mode } = useTheme();

  return (
    <Sonner
      className="toaster group"
      closeButton
      position="top-right"
      richColors
      style={toastColorVars}
      theme={mode}
      toastOptions={{
        classNames: {
          closeButton:
            "!bg-app-surface !border-app-border !text-app-text hover:!bg-app-soft",
          actionButton: "!bg-primary !text-on-primary hover:!bg-primary-hover !rounded-control border-none font-medium",
          toast:
            "top-16 rounded-app border p-4 shadow-lift",
          title: "font-semibold"
        }
      }}
      {...props}
    />
  );
}
