"use client";

import type { ReactNode } from "react";
import {
  FormProvider,
  type FieldErrors,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn
} from "react-hook-form";
import { onInvalidSubmit } from "@/lib/forms";

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
  // A blocked submit: react-hook-form focuses the first invalid field, which turns red, and one
  // toast names the problem (UI_RULES § "Form errors").
  function handleInvalid(errors: FieldErrors<TFieldValues>) {
    onInvalidSubmit(errors);
  }

  return (
    <FormProvider {...form}>
      <form id={id} className={className} onSubmit={form.handleSubmit(onSubmit, handleInvalid)} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}


