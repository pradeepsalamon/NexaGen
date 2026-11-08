"use client";

import { Moon, Sun } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Sun/moon switch: the knob slides across a pill. Its position and icon come
 * from the `dark:` variant, so the knob moves on the same paint as the theme
 * (the provider swaps `data-theme` straight from the click) and there is no
 * flash before hydration. `data-theme-keep-transition` lets the knob animate
 * through the provider's transition freeze.
 */
export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const label = `Change to ${isDark ? "light" : "dark"} theme`;

  return (
    <SimpleTooltip label={label} side="bottom">
      <button
        aria-label={label}
        aria-pressed={isDark}
        className="relative inline-flex h-9 w-[72px] shrink-0 cursor-pointer items-center rounded-full border-2 border-app-border bg-app-soft shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
        onClick={toggleMode}
        type="button"
      >
        <span aria-hidden="true" className="absolute left-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-app-muted">
          <Sun className="size-3.5" strokeWidth={2.5} />
        </span>
        <span aria-hidden="true" className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-app-muted">
          <Moon className="size-3.5" strokeWidth={2.5} />
        </span>
        <span
          aria-hidden="true"
          className="absolute left-1 top-1/2 z-10 flex size-6 -translate-y-1/2 translate-x-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-card motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-in-out dark:translate-x-9"
          data-theme-keep-transition=""
        >
          <Sun className="size-3.5 dark:hidden" strokeWidth={2.5} />
          <Moon className="hidden size-3.5 dark:block" strokeWidth={2.5} />
        </span>
      </button>
    </SimpleTooltip>
  );
}
