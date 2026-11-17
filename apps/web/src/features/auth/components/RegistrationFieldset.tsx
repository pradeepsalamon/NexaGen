import type { ReactNode } from "react";

type RegistrationFieldsetProps = {
  legend: string;
  children: ReactNode;
};

/** One titled group of a registration form; fields sit two to a row from `sm`. */
export function RegistrationFieldset({ legend, children }: RegistrationFieldsetProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-semibold text-app-text">{legend}</legend>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
