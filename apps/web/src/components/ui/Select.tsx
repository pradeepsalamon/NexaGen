import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./fieldStyles";

export type SelectOption = {
  label: string;
  value: string;
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
        density === "compact" ? "min-h-9 px-3 pr-8 text-xs sm:min-h-[38px]" : "min-h-11 px-4 pr-10",
        "bg-[linear-gradient(45deg,transparent_50%,var(--color-text-muted)_50%),linear-gradient(135deg,var(--color-text-muted)_50%,transparent_50%)] bg-[length:6px_6px,6px_6px] bg-[position:calc(100%-20px)_52%,calc(100%-14px)_52%] bg-no-repeat",
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
