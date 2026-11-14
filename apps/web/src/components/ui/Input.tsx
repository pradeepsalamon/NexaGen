import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
  /** Decorative icon inside the field, on the left. */
  leadingIcon?: ReactNode;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, hasError = false, leadingIcon, type, ...props },
  ref
) {
  const input = (
    <input
      aria-invalid={hasError}
      className={cn(
        "flex min-h-11 w-full rounded-full border bg-app-surface px-4 text-sm text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] transition placeholder:text-app-muted/70 hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none",
        hasError ? "border-app-danger" : "border-app-border",
        leadingIcon && "pl-11",
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
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-app-muted [&>svg]:size-4"
      >
        {leadingIcon}
      </span>
      {input}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
