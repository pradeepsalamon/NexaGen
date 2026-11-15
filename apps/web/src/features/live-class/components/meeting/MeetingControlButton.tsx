"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

/**
 * - `default`: a control that is on or neutral.
 * - `off`: your own mic or camera is off (soft red, as video-call apps do).
 * - `active`: something this control opens is open, or a hand is raised (blue).
 * - `danger`: kept for old callers; reads the same as `off`. Leave has its own `LeaveButton`.
 */
type ControlVariant = "default" | "off" | "active" | "danger";

interface MeetingControlButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: ControlVariant;
  /** Unread or waiting count, shown as a blue badge (9+ above nine). */
  badge?: number;
  /** Optional keyboard hint rendered as a <kbd> inside the tooltip. */
  shortcut?: string;
  /** Shows a spinner and disables the button (waiting for the server). */
  loading?: boolean;
  /**
   * Locked by the class rules: disabled, with a lock mark. The `label` should
   * say who locked it ("Microphone turned off by the coach").
   */
  locked?: boolean;
}

/** Control button (spec component 3): 44 × 44, 8px radius, 20px icon, the same size on every screen. */
export const CONTROL_BUTTON_BASE =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-control border transition-colors duration-150 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus";

export const CONTROL_BUTTON_VARIANTS: Record<ControlVariant, string> = {
  default:
    "border-app-line-strong/60 bg-app-surface text-app-text hover:bg-app-soft",
  off: "border-app-danger/30 bg-app-danger-soft text-app-danger-ink hover:bg-app-danger/20",
  danger: "border-app-danger/30 bg-app-danger-soft text-app-danger-ink hover:bg-app-danger/20",
  active: "border-primary bg-primary text-on-primary hover:bg-primary-hover",
};

/** The count badge on a control or tab: blue, full radius, 12px figures. */
export function ControlBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold tabular-nums leading-none text-on-primary ring-2 ring-app-surface",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export const MeetingControlButton = forwardRef<
  HTMLButtonElement,
  MeetingControlButtonProps
>(function MeetingControlButton(
  { icon, label, variant = "default", badge, shortcut, loading, locked, disabled, className, onClick, ...props },
  ref
) {
  // A locked control stays focusable and hoverable (aria-disabled), so its tooltip can say who locked it.
  const isDisabled = disabled || loading || locked;
  const spokenLabel = badge && badge > 0 ? `${label} (${badge})` : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={cn(
            CONTROL_BUTTON_BASE,
            CONTROL_BUTTON_VARIANTS[variant],
            isDisabled && "cursor-not-allowed opacity-50 hover:bg-app-surface",
            locked && "border-dashed",
            className
          )}
          aria-label={spokenLabel}
          aria-busy={loading || undefined}
          aria-disabled={locked || undefined}
          disabled={(disabled || loading) && !locked}
          onClick={locked ? (event) => event.preventDefault() : onClick}
          {...props}
        >
          {loading ? <Spinner className="size-5" /> : icon}
          {locked ? (
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-app-text text-app-surface ring-2 ring-app-surface"
            >
              <Lock className="size-2.5" strokeWidth={3} />
            </span>
          ) : null}
          {badge !== undefined ? <ControlBadge count={badge} /> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-1.5">
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded-chip border border-app-surface/20 px-1 font-mono text-xs font-semibold">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
