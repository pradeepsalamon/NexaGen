import type { InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function Checkbox({ className = "", id, label, ...props }: CheckboxProps) {
  return (
    <label
      className={`inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-app-muted ${className}`.trim()}
      htmlFor={id}
    >
      <input
        className="size-[18px] accent-primary"
        id={id}
        type="checkbox"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
