"use client";

import type { ReactNode } from "react";
import {
  FormProvider,
  type FieldErrors,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn
} from "react-hook-form";
import { useToast } from "@/providers/ToastProvider";

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
  const { error } = useToast();

  // Each field shows its own message under it (and react-hook-form focuses the first one), so
  // a blocked submit needs no toast listing them again. Only an error with no field of its own
  // (`root`) is a toast (UI_RULES § "Form errors").
  function handleInvalid(errors: FieldErrors<TFieldValues>) {
    const rootMessage = errors.root?.message;
    if (typeof rootMessage === "string" && rootMessage) {
      error({ title: "Please fix the form", message: rootMessage });
    }
  }

  return (
    <FormProvider {...form}>
      <form id={id} className={className} onSubmit={form.handleSubmit(onSubmit, handleInvalid)} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}


