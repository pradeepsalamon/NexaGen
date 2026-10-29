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
          className="relative h-9 min-h-9 w-[72px] rounded-full border-2 border-app-border bg-app-soft p-1 shadow-card hover:bg-app-soft"
          onClick={toggleMode}
          type="button"
          variant="outline"
        >
          <span
            aria-hidden="true"
            className="absolute flex size-6 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_8px_18px_color-mix(in_srgb,var(--color-primary)_38%,transparent)] transition-transform duration-300 ease-in-out z-10"
            data-theme-keep-transition=""
            style={{
              transform: isDark ? "translateX(36px)" : "translateX(0)",
              left: "4px",
              top: "4px"
            }}
          >
            {isDark ? (
              <Moon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            ) : (
              <Sun aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            )}
          </span>
          
          <span
            aria-hidden="true"
            className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full text-app-muted z-0"
          >
            <Sun aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </span>
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-app-muted z-0"
          >
            <Moon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
