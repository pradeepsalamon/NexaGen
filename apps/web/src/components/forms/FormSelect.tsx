import { useFormContext } from "react-hook-form";
import { FormField as BaseFormField } from "../ui/FormField";
import { Select, type SelectOption } from "../ui/Select";

import { SelectHTMLAttributes } from "react";

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  name: string;
  label: string;
  hint?: string;
  id?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function FormSelect({ name, label, hint, id, options, placeholder, ...props }: FormSelectProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;
  const selectId = id || name;

  return (
    <BaseFormField id={selectId} label={label} hint={hint} error={error}>
      <Select
        id={selectId}
        options={options}
        placeholder={placeholder}
        hasError={!!error}
        {...register(name)}
        {...props}
      />
    </BaseFormField>
  );
}
