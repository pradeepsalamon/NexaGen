"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { useTheme } from "../../providers/ThemeProvider";

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
  "--warning-text": "#ffffff"
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
            "border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white",
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
