"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
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
}

const variantStyles: Record<ControlVariant, string> = {
  default:
    "bg-app-surface text-app-muted hover:bg-app-soft hover:text-app-text border border-app-border",
  active:
    "bg-primary text-white hover:bg-primary/90 shadow-sm",
  danger:
    "bg-red-500 text-white hover:bg-red-600 border border-red-500 shadow-sm",
};

export const MeetingControlButton = forwardRef<
  HTMLButtonElement,
  MeetingControlButtonProps
>(function MeetingControlButton(
  { icon, label, variant = "default", badge, className, ...props },
  ref
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full transition-all duration-150 ease-out min-[360px]:size-11 sm:size-12",
            "hover:scale-105 active:scale-95",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            variantStyles[variant],
            className
          )}
          aria-label={label}
          {...props}
        >
          {icon}
          {badge !== undefined && badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-md">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
});
