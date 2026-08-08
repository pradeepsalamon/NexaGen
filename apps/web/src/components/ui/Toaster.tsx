"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "@/providers/ThemeProvider";

type ToasterProps = ComponentProps<typeof Sonner>;

const toastColorVars = {
  "--error-bg": "#dc2626",
  "--error-border": "rgba(253, 164, 175, 0.78)",
  "--error-text": "#ffffff",
  "--success-bg": "#16a34a",
  "--success-border": "rgba(110, 231, 183, 0.78)",
  "--success-text": "#ffffff",
  "--warning-bg": "#f59e0b",
  "--warning-border": "rgba(253, 230, 138, 0.82)",
  "--warning-text": "#ffffff",
  "--info-bg": "#334155",
  "--info-border": "rgba(100, 116, 139, 0.78)",
  "--info-text": "#ffffff",
  "--normal-bg": "#334155",
  "--normal-border": "rgba(100, 116, 139, 0.78)",
  "--normal-text": "#ffffff"
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
          actionButton: "!bg-white !text-black hover:!bg-gray-100 border-none font-bold",
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
