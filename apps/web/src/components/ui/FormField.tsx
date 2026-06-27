import type { ReactNode } from "react";

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
      <label className="text-sm font-bold text-app-text" htmlFor={id}>
        {label}
      </label>
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
