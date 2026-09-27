import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  hasError?: boolean;
  options: SelectOption[];
  placeholder?: string;
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className, hasError = false, options, placeholder, ...props },
    ref
  ) {
    return (
      <select
        aria-invalid={hasError}
        ref={ref}
      className={cn(
        "min-h-11 w-full appearance-none rounded-full border bg-app-surface bg-[linear-gradient(45deg,transparent_50%,var(--color-text-muted)_50%),linear-gradient(135deg,var(--color-text-muted)_50%,transparent_50%)] bg-[length:6px_6px,6px_6px] bg-[position:calc(100%-20px)_52%,calc(100%-14px)_52%] bg-no-repeat px-4 pr-10 text-sm text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] transition hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none",
        hasError ? "border-app-danger" : "border-app-border",
        className
      )}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
