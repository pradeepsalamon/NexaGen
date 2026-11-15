"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "@/providers/ThemeProvider";

type ToasterProps = ComponentProps<typeof Sonner>;

// Solid fills, the same as the bulk-action bar: deep colours with white text in
// both themes (`.solid-status`), gold for warnings. A neutral toast inverts the page.
const toastColorVars = {
  "--error-bg": "rgb(var(--rgb-danger))",
  "--error-border": "rgb(var(--rgb-danger))",
  "--error-text": "rgb(var(--rgb-on-danger))",
  "--success-bg": "rgb(var(--rgb-success))",
  "--success-border": "rgb(var(--rgb-success))",
  "--success-text": "rgb(var(--rgb-on-success))",
  "--warning-bg": "rgb(var(--rgb-accent))",
  "--warning-border": "rgb(var(--rgb-accent))",
  "--warning-text": "rgb(var(--rgb-on-accent))",
  "--info-bg": "rgb(var(--rgb-info))",
  "--info-border": "rgb(var(--rgb-info))",
  "--info-text": "rgb(var(--rgb-on-info))",
  "--normal-bg": "rgb(var(--rgb-text))",
  "--normal-border": "rgb(var(--rgb-text-muted))",
  "--normal-text": "rgb(var(--rgb-surface))"
} as CSSProperties;

export function Toaster({ ...props }: ToasterProps) {
  const { mode } = useTheme();

  return (
    <Sonner
      className="toaster solid-status group"
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
