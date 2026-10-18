"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      className={cn(
        "z-50 overflow-hidden rounded-control bg-app-text px-3 py-1.5 text-xs font-bold text-app-surface shadow-soft animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

type SimpleTooltipProps = {
  children: React.ReactNode;
  label: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["align"];
  className?: string;
};

/**
 * Reusable single-child tooltip. Prefer this over the native `title=` attribute
 * on interactive elements — it is themed, keyboard-accessible, and consistent.
 * The child must forward a ref and props (a DOM element or `asChild` primitive).
 */
function SimpleTooltip({ align, children, className, label, side = "top" }: SimpleTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent align={align} className={className} side={side}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { SimpleTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
