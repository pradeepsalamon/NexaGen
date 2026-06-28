import type { ReactNode } from "react";
import { Label } from "@/components/ui/Label";

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
};

export function FormField({
  children,
  error,
  hint,
  id,
  label
}: FormFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
      </Label>
      {children}
      {error ? (
        <p
          className="m-0 text-xs leading-5 text-app-danger"
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

