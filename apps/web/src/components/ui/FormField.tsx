import type { ReactNode } from "react";
import { Label } from "@/components/ui/Label";

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
};

export function FormField({
  children,
  error,
  hint,
  id,
  label,
  required = false
}: FormFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-app-danger-ink">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p
          className="sr-only"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="m-0 text-xs leading-5 text-app-muted" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

