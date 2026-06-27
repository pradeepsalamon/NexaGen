import type { SelectHTMLAttributes } from "react";

type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  hasError?: boolean;
  options: SelectOption[];
  placeholder?: string;
};

export function Select({
  className = "",
  hasError = false,
  options,
  placeholder,
  ...props
}: SelectProps) {
  return (
    <select
      aria-invalid={hasError}
      className={`min-h-11 w-full appearance-none rounded-control border bg-app-surface bg-[linear-gradient(45deg,transparent_50%,var(--color-text-muted)_50%),linear-gradient(135deg,var(--color-text-muted)_50%,transparent_50%)] bg-[length:6px_6px,6px_6px] bg-[position:calc(100%-20px)_52%,calc(100%-14px)_52%] bg-no-repeat px-3.5 pr-10 text-sm text-app-text transition hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none ${hasError ? "border-app-danger" : "border-app-border"} ${className}`.trim()}
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
}
