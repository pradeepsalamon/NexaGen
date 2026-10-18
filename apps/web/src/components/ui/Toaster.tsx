"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "@/providers/ThemeProvider";

type ToasterProps = ComponentProps<typeof Sonner>;

// Theme status tokens. Warning text is black: white on amber is unreadable.
// A neutral toast inverts the page (text colour as its background).
const toastColorVars = {
  "--error-bg": "var(--color-danger)",
  "--error-border": "color-mix(in srgb, var(--color-danger) 60%, white)",
  "--error-text": "white",
  "--success-bg": "var(--color-success)",
  "--success-border": "color-mix(in srgb, var(--color-success) 60%, white)",
  "--success-text": "white",
  "--warning-bg": "var(--color-warning)",
  "--warning-border": "color-mix(in srgb, var(--color-warning) 60%, white)",
  "--warning-text": "black",
  "--info-bg": "var(--color-info)",
  "--info-border": "color-mix(in srgb, var(--color-info) 60%, white)",
  "--info-text": "white",
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
          actionButton: "!bg-white !text-black hover:!bg-white/90 border-none font-bold",
          description: "text-current/90",
          toast:
            "top-16 rounded-app border p-4 text-white shadow-[0_24px_70px_rgba(16,24,40,0.22)]",
          title: "font-extrabold text-white"
        }
      }}
      {...props}
    />
  );
}
