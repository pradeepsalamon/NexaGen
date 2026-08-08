"use client";

import type { ReactNode } from "react";
import {
  FormProvider,
  type FieldError,
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

  function handleInvalid(errors: FieldErrors<TFieldValues>) {
    const messages = getFieldErrorMessages(errors);
    const visibleMessages = messages.slice(0, 3);
    const remainingCount = messages.length - visibleMessages.length;

    error({
      title: "Please fix the form",
      message:
        visibleMessages.length > 0
          ? [
              ...visibleMessages,
              ...(remainingCount > 0 ? [`${remainingCount} more error${remainingCount === 1 ? "" : "s"}.`] : [])
            ].join("\n")
          : "Check the form and try again."
    });
  }

  return (
    <FormProvider {...form}>
      <form id={id} className={className} onSubmit={form.handleSubmit(onSubmit, handleInvalid)} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}

function getFieldErrorMessages(errors: FieldErrors<FieldValues>) {
  const messages: string[] = [];

  Object.values(errors).forEach((error) => {
    if (!error) return;

    if (isFieldError(error)) {
      if (typeof error.message === "string") {
        messages.push(error.message);
      }
    } else if (typeof error === "object" && error !== null && !Array.isArray(error)) {
      messages.push(...getFieldErrorMessages(error as FieldErrors<FieldValues>));
    } else if (Array.isArray(error)) {
      error.forEach((item) => {
        if (typeof item === "object" && item !== null) {
          messages.push(...getFieldErrorMessages(item as FieldErrors<FieldValues>));
        }
      });
    }
  });

  return Array.from(new Set(messages));
}

function isFieldError(error: unknown): error is FieldError {
  return typeof error === "object" && error !== null && "type" in error;
}
