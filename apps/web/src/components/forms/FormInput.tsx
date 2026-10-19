import { useFormContext } from "react-hook-form";
import { FormField as BaseFormField } from "../ui/FormField";
import { Input, type InputProps } from "../ui/Input";

interface FormInputProps extends Omit<InputProps, "name"> {
  name: string;
  label: string;
  hint?: string;
}

export function FormInput({ name, label, hint, id, ...props }: FormInputProps) {
  const { register, getFieldState, formState } = useFormContext();
  // getFieldState resolves dotted/indexed names ("guardian.phone", "items.0.qty").
  const error = getFieldState(name, formState).error?.message;
  const inputId = id || name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <BaseFormField id={inputId} label={label} hint={hint} error={error}>
      <Input
        id={inputId}
        hasError={!!error}
        aria-describedby={describedBy}
        {...register(name)}
        {...props}
      />
    </BaseFormField>
  );
}
