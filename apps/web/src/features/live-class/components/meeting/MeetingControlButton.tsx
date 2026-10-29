"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

type ControlVariant = "default" | "active" | "danger";

interface MeetingControlButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: ControlVariant;
  badge?: number;
  /** Optional keyboard hint rendered as a <kbd> inside the tooltip. */
  shortcut?: string;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

const variantStyles: Record<ControlVariant, string> = {
  default:
    "bg-app-surface text-app-muted hover:bg-app-soft hover:text-app-text border border-app-border",
  active:
    "bg-primary text-on-primary hover:bg-primary/90 shadow-card",
  danger:
    "bg-app-danger text-white hover:opacity-90 border border-app-danger shadow-card",
};

export const MeetingControlButton = forwardRef<
  HTMLButtonElement,
  MeetingControlButtonProps
>(function MeetingControlButton(
  { icon, label, variant = "default", badge, shortcut, loading, disabled, className, ...props },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full transition duration-150 ease-out sm:size-12",
            "hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            variantStyles[variant],
            isDisabled && "pointer-events-none opacity-50",
            className
          )}
          aria-label={label}
          disabled={isDisabled}
          {...props}
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
          {badge !== undefined && badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary shadow-card">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-1.5">
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded border border-white/20 px-1 text-[10px] font-mono font-semibold">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
