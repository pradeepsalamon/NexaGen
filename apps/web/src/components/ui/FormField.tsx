import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import { Label } from "@/components/ui/Label";

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  /** Draw `error` under the field: only for a notice the user must keep reading (a lockout). */
  errorVisible?: boolean;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
};

type DescribedProps = { "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

/**
 * Label, control, optional hint and the field's error. The hint keeps its slot in the flow;
 * the error is screen-reader text (FieldError) and the control turns red. A single
 * control child gets `aria-describedby` (hint + error) and `aria-invalid` filled in.
 */
export function FormField({
  children,
  error,
  errorVisible = false,
  hint,
  id,
  label,
  required = false
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? fieldErrorId(id) : undefined;

  let control = children;
  if ((isValidElement<DescribedProps>(children) && typeof children.type !== "string") || isNativeControl(children)) {
    const element = children as ReactElement<DescribedProps>;
    const describedBy = [element.props["aria-describedby"], hintId, errorId]
      .flatMap((value) => (value ? value.split(" ") : []))
      .filter((value, index, all) => all.indexOf(value) === index)
      .join(" ");
    control = cloneElement(element, {
      "aria-describedby": describedBy || undefined,
      ...(error ? { "aria-invalid": true } : {})
    });
  }

  return (
    <div className="relative grid gap-1">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-app-danger-ink">
            *
          </span>
        )}
      </Label>
      {control}
      {hint ? (
        <p className="m-0 text-xs leading-5 text-app-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      <FieldError id={id} message={error} visible={errorVisible} />
    </div>
  );
}

function isNativeControl(node: ReactNode) {
  return (
    isValidElement(node) &&
    (node.type === "input" || node.type === "select" || node.type === "textarea" || node.type === "button")
  );
}
