import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./fieldStyles";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** `compact` is the dense field of multi-column forms (registration). */
  density?: "default" | "compact";
  hasError?: boolean;
  /** Decorative icon inside the field, on the left. */
  leadingIcon?: ReactNode;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, density = "default", hasError = false, leadingIcon, type, ...props },
  ref
) {
  const compact = density === "compact";
  const input = (
    <input
      aria-invalid={hasError}
      className={cn(
        "flex w-full",
        fieldClasses({ hasError }),
        compact ? "min-h-9 px-3 text-xs sm:min-h-[38px]" : "min-h-11 px-4",
        leadingIcon && (compact ? "pl-8" : "pl-10"),
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );

  if (!leadingIcon) return input;

  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 flex items-center text-nx-muted",
          compact ? "left-2.5 [&>svg]:size-3.5" : "left-3.5 [&>svg]:size-4"
        )}
      >
        {leadingIcon}
      </span>
      {input}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
