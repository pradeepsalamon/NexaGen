import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, hasError = false, type, ...props },
  ref
) {
  return (
    <input
      aria-invalid={hasError}
      className={cn(
        "flex min-h-11 w-full rounded-full border bg-app-surface px-4 text-sm text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] transition placeholder:text-app-muted/70 hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none",
        hasError ? "border-app-danger" : "border-app-border",
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };

