"use client";

import { Moon, Sun } from "lucide-react";
import { HEADER_ICON_BUTTON } from "@/components/layout/headerStyles";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/providers/ThemeProvider";

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const label = `Change to ${isDark ? "light" : "dark"} theme`;

  return (
    <SimpleTooltip label={label}>
      <button
        aria-label={label}
        aria-pressed={isDark}
        className={HEADER_ICON_BUTTON}
        onClick={toggleMode}
        type="button"
      >
        {/* CSS picks the icon, so there's no flash before the theme hydrates. */}
        <Moon aria-hidden="true" className="size-5 dark:hidden" strokeWidth={2.25} />
        <Sun aria-hidden="true" className="hidden size-5 dark:block" strokeWidth={2.25} />
      </button>
    </SimpleTooltip>
  );
}
