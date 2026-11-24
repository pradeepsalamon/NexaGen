"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type CheckboxProps = React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
> & {
  label?: string;
};

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, id, label, ...props }, ref) => {
  const checkbox = (
    <CheckboxPrimitive.Root
      className={cn(
        // 14px box; the `before:` area around it keeps a comfortable tap target without
        // drawing it bigger. It dips on press and the tick pops in (reduced motion: neither).
        "peer relative size-3.5 shrink-0 rounded-[0.1875rem] border-[1.5px] border-app-line-strong bg-app-surface transition-[background-color,border-color,transform] duration-150 before:absolute before:-inset-2 before:content-[''] hover:border-primary motion-safe:active:scale-[0.82] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary",
        className
      )}
      id={id}
      ref={ref}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current motion-safe:data-[state=checked]:animate-checkbox-tick-in">
        <Check className="size-2.5" strokeWidth={4} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) {
    return checkbox;
  }

  return (
    <label
      className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-medium text-app-muted"
      htmlFor={id}
    >
      {checkbox}
      <span>{label}</span>
    </label>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
