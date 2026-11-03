"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LogOut } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * Leave (spec component 4): 44px tall, red fill, icon + "Leave" (icon only on
 * phones). For a coach it opens the Leave class / End class for everyone dialog.
 */
export const LeaveButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }>(
  function LeaveButton({ className, label = "Leave", ...props }, ref) {
    return (
      <SimpleTooltip label="Leave class">
        <button
          ref={ref}
          type="button"
          aria-label="Leave class"
          className={cn(
            "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-control bg-app-danger px-3 text-sm font-semibold text-on-danger transition-colors hover:bg-app-danger-hover md:px-4",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
            className,
          )}
          {...props}
        >
          <LogOut aria-hidden="true" className="size-5" strokeWidth={1.75} />
          <span className="hidden md:inline">{label}</span>
        </button>
      </SimpleTooltip>
    );
  },
);
