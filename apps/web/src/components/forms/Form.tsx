import type { ReactNode } from "react";
import { FormProvider, type UseFormReturn, type FieldValues, type SubmitHandler } from "react-hook-form";

interface FormProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  onSubmit: SubmitHandler<TFieldValues>;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Form<TFieldValues extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  id
}: FormProps<TFieldValues>) {
  return (
    <FormProvider {...form}>
      <form id={id} className={className} onSubmit={form.handleSubmit(onSubmit)} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}
