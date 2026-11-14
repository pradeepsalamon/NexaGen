"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
  checked: boolean;
  label?: string;
  /** Same signature as `Checkbox`'s, so the two are drop-in swappable. */
  onCheckedChange?: (checked: boolean) => void;
};

/**
 * On/off toggle for settings. Use `Checkbox` instead for multi-select lists,
 * row selection and consent/acknowledgement ticks.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, className, disabled, id, label, onCheckedChange, onClick, ...props }, ref) => {
    const control = (
      <button
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-50",
          checked
            ? "border-transparent bg-[color-mix(in_srgb,var(--color-primary)_96%,white)]"
            : "border-app-border bg-app-soft",
          className
        )}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        id={id}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onCheckedChange?.(!checked);
        }}
        ref={ref}
        role="switch"
        type="button"
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none block size-[18px] rounded-full shadow-sm transition-transform duration-200 ease-out",
            checked ? "translate-x-[22px] bg-white" : "translate-x-[3px] bg-app-muted/70"
          )}
        />
      </button>
    );

    if (!label) return control;

    return (
      <label
        className={cn(
          "inline-flex min-h-10 items-center gap-2.5 text-sm font-medium text-app-muted",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        )}
        htmlFor={id}
      >
        {control}
        <span>{label}</span>
      </label>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
