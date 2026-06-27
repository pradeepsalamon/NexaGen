"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const ModeIcon = isDark ? Moon : Sun;

  return (
    <button
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-app-border bg-app-surface/85 py-1 pl-1 pr-3 text-sm font-bold text-app-text"
      onClick={toggleMode}
      type="button"
    >
      <span
        aria-hidden="true"
        className="block h-7 w-12 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-surface-soft))] p-1"
      >
        <span
          className={`block size-5 rounded-full bg-primary shadow-[0_5px_16px_color-mix(in_srgb,var(--color-primary)_32%,transparent)] transition ${isDark ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
      <ModeIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
