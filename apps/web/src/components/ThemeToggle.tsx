"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/Tooltip";
import { useTheme } from "@/providers/ThemeProvider";

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const label = `Change to ${isDark ? "light" : "dark"} theme`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={isDark}
          className="relative h-9 min-h-9 w-[72px] rounded-full border-2 border-app-border bg-app-soft p-1 shadow-card hover:bg-app-soft dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-950"
          onClick={toggleMode}
          type="button"
          variant="outline"
        >
          <span
            aria-hidden="true"
            className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--color-primary)_38%,transparent)] transition dark:bg-transparent dark:text-white/70 dark:shadow-none"
          >
            <Sun
              aria-hidden="true"
              className="size-3.5"
              strokeWidth={2.5}
            />
          </span>
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-app-muted transition dark:bg-primary dark:text-white dark:shadow-[0_8px_18px_color-mix(in_srgb,var(--color-primary)_38%,transparent)]"
          >
            <Moon
              aria-hidden="true"
              className="size-3.5"
              strokeWidth={2.5}
            />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
