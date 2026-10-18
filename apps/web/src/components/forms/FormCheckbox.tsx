import { useFormContext, Controller } from "react-hook-form";
import { Checkbox } from "../ui/Checkbox";

interface FormCheckboxProps {
  name: string;
  label: string;
  id?: string;
}

export function FormCheckbox({ name, label, id }: FormCheckboxProps) {
  const { control } = useFormContext();
  const checkboxId = id || name;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value, ref } }) => (
        <Checkbox
          id={checkboxId}
          label={label}
          checked={value}
          onCheckedChange={onChange}
          ref={ref}
        />
      )}
    />
  );
}
