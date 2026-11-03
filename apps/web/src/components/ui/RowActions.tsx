"use client";

import { MoreVertical, type LucideIcon } from "lucide-react";
import Link from "next/link";
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
  tone?: "danger" | "default" | "warning";
} & (
  | { href?: never; onSelect: () => void }
  /** Navigates instead, so the action keeps a link's open-in-new-tab behaviour. */
  | { href: string; onSelect?: never }
);

// Neutral icon buttons; only the icon carries the action's colour.
const INLINE_TONE: Record<NonNullable<RowAction["tone"]>, string> = {
  danger: "text-app-danger-ink hover:bg-app-danger-soft",
  default: "",
  warning: "text-warning-ink hover:bg-warning-soft"
};

/**
 * Table row actions as icon buttons. Pass `inline` to show only that many and
 * group the rest behind a "⋮" menu (a single leftover stays inline).
 */
export function RowActions({ actions, inline }: { actions: RowAction[]; inline?: number }) {
  const inlineCount = inline === undefined || actions.length <= inline + 1 ? actions.length : inline;
  const shown = actions.slice(0, inlineCount);
  const overflow = actions.slice(inlineCount);
  const destructiveStart = overflow.findIndex((action) => action.tone === "danger");

  return (
    <div className="flex items-center justify-end gap-2">
      {shown.map((action) => {
        const Icon = action.icon;
        return (
          <SimpleTooltip key={action.label} label={action.label}>
            {action.href && !action.disabled ? (
              <Button
                asChild
                className={cn("size-8", INLINE_TONE[action.tone ?? "default"])}
                size="icon"
                variant="neutral"
              >
                <Link aria-label={action.ariaLabel ?? action.label} href={action.href}>
                  <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Link>
              </Button>
            ) : (
              <Button
                aria-label={action.ariaLabel ?? action.label}
                className={cn("size-8", INLINE_TONE[action.tone ?? "default"])}
                disabled={action.disabled}
                onClick={action.onSelect}
                size="icon"
                type="button"
                variant="neutral"
              >
                <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            )}
          </SimpleTooltip>
        );
      })}

      {overflow.length ? (
        <DropdownMenu>
          {/* A Radix trigger already; a tooltip wrapper would break its composition. */}
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More actions"
              className="size-8"
              size="icon"
              title="More actions"
              type="button"
              variant="neutral"
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
                    asChild={Boolean(action.href)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 py-2 font-semibold",
                      action.tone === "danger" &&
                        "text-app-danger-ink focus:bg-app-danger-soft focus:text-app-danger-ink"
                    )}
                    disabled={action.disabled}
                    onSelect={action.onSelect}
                  >
                    {action.href ? (
                      <Link href={action.href}>
                        <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                        {action.label}
                      </Link>
                    ) : (
                      <>
                        <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                        {action.label}
                      </>
                    )}
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
