"use client";

import { MoreVertical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export type RowAction = {
  /** Accessible name, e.g. "Edit Batch A". Falls back to `label`. */
  ariaLabel?: string;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  tone?: "danger" | "default" | "warning";
};

// Filled in the action's colour; hover lightens it. Same in both themes.
const INLINE_TONE: Record<NonNullable<RowAction["tone"]>, string> = {
  danger:
    "border-app-danger bg-app-danger text-white hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white",
  default:
    "border-primary bg-primary text-on-primary hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary",
  warning:
    "border-secondary bg-secondary text-black hover:border-[color-mix(in_srgb,var(--color-secondary)_70%,white)] hover:bg-[color-mix(in_srgb,var(--color-secondary)_70%,white)] hover:text-black"
};

/**
 * Table row actions as round icon buttons. Pass `inline` to show only that many
 * and group the rest behind a "⋮" menu (a single leftover stays inline).
 */
export function RowActions({ actions, inline }: { actions: RowAction[]; inline?: number }) {
  const inlineCount = inline === undefined || actions.length <= inline + 1 ? actions.length : inline;
  const shown = actions.slice(0, inlineCount);
  const overflow = actions.slice(inlineCount);
  const destructiveStart = overflow.findIndex((action) => action.tone === "danger");

  return (
    <div className="flex items-center justify-center gap-2">
      {shown.map((action) => {
        const Icon = action.icon;
        return (
          <SimpleTooltip key={action.label} label={action.label}>
            <Button
              aria-label={action.ariaLabel ?? action.label}
              className={cn(
                "size-8 rounded-full border p-0 shadow-none transition-colors",
                INLINE_TONE[action.tone ?? "default"]
              )}
              disabled={action.disabled}
              onClick={action.onSelect}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        );
      })}

      {overflow.length ? (
        <DropdownMenu>
          {/* A Radix trigger already; a tooltip wrapper would break its composition. */}
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More actions"
              className="size-8 rounded-full border-app-border p-0 text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
              size="icon"
              title="More actions"
              type="button"
              variant="outline"
            >
              <MoreVertical aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {overflow.map((action, index) => {
              const Icon = action.icon;
              return (
                <div key={action.label}>
                  {index === destructiveStart && index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    aria-label={action.ariaLabel ?? action.label}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 py-2 font-semibold",
                      action.tone === "danger" &&
                        "text-app-danger focus:bg-app-danger/10 focus:text-app-danger"
                    )}
                    disabled={action.disabled}
                    onSelect={action.onSelect}
                  >
                    <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                    {action.label}
                  </DropdownMenuItem>
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
