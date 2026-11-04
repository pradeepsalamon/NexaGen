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
          "relative inline-flex h-[1.375rem] w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-app-line-strong",
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
            "pointer-events-none block size-4 rounded-full bg-paper transition-transform duration-200 ease-out",
            checked ? "translate-x-[1.3125rem]" : "translate-x-[0.1875rem]"
          )}
        />
      </button>
    );

    if (!label) return control;

    return (
      <label
        className={cn(
          "inline-flex min-h-10 items-center gap-2.5 text-sm font-medium",
          // Disabled: a lighter text colour, not opacity (which stacked on the switch's own and failed contrast).
          disabled ? "cursor-not-allowed text-app-subtle" : "cursor-pointer text-app-muted"
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
