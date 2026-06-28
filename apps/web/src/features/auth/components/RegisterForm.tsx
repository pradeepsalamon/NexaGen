"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { FormField } from "../../../components/ui/FormField";
import { Input } from "../../../components/ui/Input";
import { PasswordInput } from "../../../components/ui/PasswordInput";
import { Select } from "../../../components/ui/Select";
import { useToast } from "../../../providers/ToastProvider";
import { getErrorMessage } from "../../../lib/errors";
import { useAuthStore } from "../../../stores/authStore";
import { register } from "../api/authApi";
import type { ExperienceLevel, RegisterFormValues } from "../types/auth";
import { AuthHeader } from "./AuthHeader";
import { AuthLayout } from "./AuthLayout";

const experienceOptions: { label: string; value: ExperienceLevel }[] = [
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" }
];

const initialValues: RegisterFormValues = {
  confirmPassword: "",
  contactNumber: "",
  email: "",
  experienceLevel: "",
  parentName: "",
  password: "",
  studentAge: "",
  studentName: ""
};

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const [values, setValues] = useState<RegisterFormValues>(initialValues);
  const registerMutation = useMutation({
    mutationFn: register,
    onError: (error) => {
      toast.danger({
        message: getErrorMessage(error),
        title: "Registration failed"
      });
    },
    onSuccess: ({ user }) => {
      setUser(user);
      toast.success({
        message: "Your account is ready.",
        title: "Registration successful"
      });
      router.push("/");
    }
  });

  function updateField<TField extends keyof RegisterFormValues>(
    field: TField,
    value: RegisterFormValues[TField]
  ) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (values.password !== values.confirmPassword) {
      const confirmPassword = event.currentTarget.elements.namedItem(
        "confirmPassword"
      );

      if (confirmPassword instanceof HTMLInputElement) {
        confirmPassword.setCustomValidity("Passwords must match.");
        confirmPassword.reportValidity();
      }

      return;
    }

    if (!values.experienceLevel) {
      return;
    }

    registerMutation.mutate({
      ...values,
      experienceLevel: values.experienceLevel
    });
  }

  return (
    <AuthLayout eyebrow="Start learning" title="Build better chess habits.">
      <Card className="w-full max-w-[610px] animate-slide-up p-4 sm:p-5">
        <AuthHeader
          actionHref="/login"
          actionLabel="Log in"
          helperText="Already learning with us?"
          title="Register"
        />
        <form className="grid gap-3.5" onSubmit={handleSubmit}>
          {registerMutation.error ? (
            <p className="rounded-control border border-app-danger bg-[color-mix(in_srgb,var(--color-danger)_8%,var(--color-surface))] px-3.5 py-3 text-sm text-app-danger">
              {registerMutation.error.message}
            </p>
          ) : null}
          <div className="grid gap-3.5 md:grid-cols-2">
            <FormField id="student-name" label="Student Name">
              <Input
                autoComplete="name"
                id="student-name"
                onChange={(event) =>
                  updateField("studentName", event.target.value)
                }
                placeholder="Student name"
                required
                value={values.studentName}
              />
            </FormField>
            <FormField id="parent-name" label="Parent Name">
              <Input
                autoComplete="name"
                id="parent-name"
                onChange={(event) =>
                  updateField("parentName", event.target.value)
                }
                placeholder="Parent name"
                required
                value={values.parentName}
              />
            </FormField>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            <FormField id="student-age" label="Student Age">
              <Input
                id="student-age"
                inputMode="numeric"
                min={4}
                onChange={(event) =>
                  updateField("studentAge", event.target.value)
                }
                placeholder="Age"
                required
                type="number"
                value={values.studentAge}
              />
            </FormField>
            <FormField id="experience-level" label="Experience Level">
              <Select
                id="experience-level"
                onChange={(event) =>
                  updateField(
                    "experienceLevel",
                    event.target.value as RegisterFormValues["experienceLevel"]
                  )
                }
                options={experienceOptions}
                placeholder="Choose level"
                required
                value={values.experienceLevel}
              />
            </FormField>
          </div>
          <FormField id="contact-number" label="Contact Number">
            <Input
              autoComplete="tel"
              id="contact-number"
              inputMode="tel"
              onChange={(event) =>
                updateField("contactNumber", event.target.value)
              }
              placeholder="Contact number"
              required
              type="tel"
              value={values.contactNumber}
            />
          </FormField>
          <FormField id="email" label="Email Address">
            <Input
              autoComplete="email"
              id="email"
              inputMode="email"
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="student@example.com"
              required
              type="email"
              value={values.email}
            />
          </FormField>
          <div className="grid gap-3.5 md:grid-cols-2">
            <FormField id="password" label="Password">
              <PasswordInput
                autoComplete="new-password"
                id="password"
                onChange={(event) =>
                  updateField("password", event.target.value)
                }
                placeholder="Create password"
                required
                value={values.password}
              />
            </FormField>
            <FormField id="confirm-password" label="Confirm Password">
              <PasswordInput
                autoComplete="new-password"
                id="confirm-password"
                name="confirmPassword"
                onChange={(event) => {
                  event.target.setCustomValidity("");
                  updateField("confirmPassword", event.target.value);
                }}
                placeholder="Confirm password"
                required
                value={values.confirmPassword}
              />
            </FormField>
          </div>
          <Button fullWidth isLoading={registerMutation.isPending} type="submit">
            {registerMutation.isPending ? "Registering..." : "Register"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
