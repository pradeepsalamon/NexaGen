import { useFormContext } from "react-hook-form";
import { FormField as BaseFormField } from "../ui/FormField";
import { Input, type InputProps } from "../ui/Input";

interface FormInputProps extends Omit<InputProps, "name"> {
  name: string;
  label: string;
  hint?: string;
}

export function FormInput({ name, label, hint, id, ...props }: FormInputProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;
  const inputId = id || name;

  return (
    <BaseFormField id={inputId} label={label} hint={hint} error={error}>
      <Input
        id={inputId}
        hasError={!!error}
        {...register(name)}
        {...props}
      />
    </BaseFormField>
  );
}
