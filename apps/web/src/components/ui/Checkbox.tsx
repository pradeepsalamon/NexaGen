import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function Checkbox({ className, id, label, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-medium text-app-muted",
        className
      )}
      htmlFor={id}
    >
      <input
        className="size-4 rounded border border-app-border accent-primary shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-60"
        id={id}
        type="checkbox"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
