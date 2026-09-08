"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { getStoredAcquisition } from "@/lib/acquisition";
import { useAuthStore } from "@/stores/authStore";
import { register } from "../api/authApi";
import type { RegisterFormValues } from "../types/auth";
import { AcquisitionSourceSelect } from "./AcquisitionSourceSelect";

const initialValues: RegisterFormValues = {
  confirmPassword: "",
  contactNumber: "",
  email: "",
  acquisitionSource: "",
  acquisitionDetail: "",
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
      toast.error({
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

    if (!values.acquisitionSource) {
      return;
    }

    const { acquisitionDetail, ...rest } = values;
    registerMutation.mutate({
      ...rest,
      // First-touch UTM/referrer data, then the user's explicit answer wins.
      ...getStoredAcquisition(),
      acquisitionSource: values.acquisitionSource,
      acquisitionDetail: acquisitionDetail.trim() || undefined
    });
  }

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit}>

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
          <AcquisitionSourceSelect
            detail={values.acquisitionDetail}
            onDetailChange={(detail) =>
              updateField("acquisitionDetail", detail)
            }
            onValueChange={(value) => updateField("acquisitionSource", value)}
            required
            value={values.acquisitionSource}
          />
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
  );
}
