"use client";

import { Contrast, Moon, Sun, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { HEADER_ICON_BUTTON } from "@/components/layout/headerStyles";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import type { ThemePreference } from "@/constants/theme";
import { revealOriginOf } from "@/lib/theme/themeReveal";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

const OPTIONS: { icon: LucideIcon; label: string; value: ThemePreference }[] = [
  { icon: Sun, label: "Light theme", value: "light" },
  { icon: Moon, label: "Dark theme", value: "dark" },
  { icon: Contrast, label: "Auto theme", value: "system" }
];

/**
 * One header button that steps through light → dark → auto (follows the device) on each click and
 * shows the current one; the new icon turns into place. The sun/moon switch it
 * replaced in the app header is still `ThemeToggle`.
 */
export function ThemeModePicker() {
  const { preference, setPreference } = useTheme();
  const index = OPTIONS.findIndex((option) => option.value === preference);
  const current = OPTIONS[index] ?? OPTIONS[0];
  const next = OPTIONS[(index + 1) % OPTIONS.length];
  const Icon = current.icon;
  const label = `${current.label}. Switch to ${next.label.toLowerCase()}`;
  // Only after a click: the saved choice arriving on page load must not play the animation.
  const [clicked, setClicked] = useState(false);

  return (
    <SimpleTooltip label={label} side="bottom">
      <button
        aria-label={label}
        className={cn(HEADER_ICON_BUTTON, "motion-safe:transition-[color,background-color,transform] motion-safe:active:scale-90")}
        onClick={(event) => {
          setClicked(true);
          setPreference(next.value, revealOriginOf(event.currentTarget));
        }}
        type="button"
      >
        {/* Keyed so each mode mounts a fresh icon and the animation replays. */}
        <Icon
          aria-hidden="true"
          className={cn("size-5", clicked && "motion-safe:animate-theme-icon-in")}
          key={current.value}
          strokeWidth={2.25}
        />
      </button>
    </SimpleTooltip>
  );
}

/** The three modes side by side, one click each. Kept, not in use. */
export function ThemeModeSegmented() {
  const { isHydrated, preference, setPreference } = useTheme();

  return (
    <div
      aria-label="Theme"
      className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border-2 border-app-border bg-app-soft px-0.5 shadow-card"
      role="radiogroup"
    >
      {OPTIONS.map(({ icon: Icon, label, value }) => {
        // The saved choice is only known in the browser; nothing is marked before then.
        const selected = isHydrated && preference === value;
        return (
          <SimpleTooltip key={value} label={label} side="bottom">
            <button
              aria-checked={selected}
              aria-label={label}
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
                selected ? "bg-primary text-on-primary shadow-card" : "text-app-muted hover:text-app-text"
              )}
              onClick={(event) => setPreference(value, revealOriginOf(event.currentTarget))}
              role="radio"
              type="button"
            >
              <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
        );
      })}
    </div>
  );
}
