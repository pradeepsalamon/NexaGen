import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./fieldStyles";

export type SelectOption = {
  label: string;
  value: string;
  /** Shown but not selectable (e.g. a value a locked setting rules out). */
  disabled?: boolean;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** `compact` matches Input's dense field. */
  density?: "default" | "compact";
  hasError?: boolean;
  options: SelectOption[];
  placeholder?: string;
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className, density = "default", hasError = false, options, placeholder, ...props },
    ref
  ) {
    return (
      <select
        aria-invalid={hasError}
        ref={ref}
      className={cn(
        "w-full appearance-none",
        fieldClasses({ hasError }),
        density === "compact" ? "min-h-[var(--control-h-sm)] px-2.5 pr-7 text-xs" : "min-h-[var(--control-h)] px-3 pr-8",
        "bg-[linear-gradient(45deg,transparent_50%,var(--color-text-muted)_50%),linear-gradient(135deg,var(--color-text-muted)_50%,transparent_50%)] bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-16px)_52%,calc(100%-11px)_52%] bg-no-repeat",
        className
      )}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} disabled={option.disabled} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
