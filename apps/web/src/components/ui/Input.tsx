import { forwardRef, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", hasError = false, ...props },
  ref
) {
  return (
    <input
      aria-invalid={hasError}
      className={`min-h-11 w-full rounded-control border bg-app-surface px-3.5 text-sm text-app-text transition placeholder:text-app-muted/70 hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none ${hasError ? "border-app-danger" : "border-app-border"} ${className}`.trim()}
      ref={ref}
      {...props}
    />
  );
});
