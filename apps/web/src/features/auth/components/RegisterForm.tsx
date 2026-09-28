"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  AtSign,
  CalendarDays,
  CheckCircle2,
  ChessKnight,
  Lock,
  Phone,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { getStoredAcquisition } from "@/lib/acquisition";
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
  const toast = useToast();
  const [values, setValues] = useState<RegisterFormValues>(initialValues);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  // No session until an admin approves the registration.
  const registerMutation = useMutation({
    mutationFn: register,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Registration failed"
      });
    },
    onSuccess: ({ email }) => {
      setSubmittedEmail(email);
      toast.success({
        message: "Your registration is submitted and under review.",
        title: "Registration received"
      });
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

  if (submittedEmail) {
    return (
      <div className="grid gap-4 text-center">
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto size-12 text-primary-ink"
          strokeWidth={2.5}
        />
        <div className="grid gap-1.5">
          <h2 className="text-lg font-semibold text-app-text">
            Registration received
          </h2>
          <p className="text-sm text-app-muted">
            We have your registration for{" "}
            <span className="font-medium text-app-text">{submittedEmail}</span>.
            An admin reviews every student account before it is activated — you
            will be able to sign in once yours is approved.
          </p>
        </div>
        <Link href="/login">
          <Button fullWidth variant="outline">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-3 [@media(max-height:700px)]:gap-2" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2 [@media(max-height:700px)]:gap-2">
        <FormField id="student-name" label="Student Full Name" required>
          <Input
            autoComplete="name"
            id="student-name"
            leadingIcon={<UserRound strokeWidth={2.25} />}
            onChange={(event) => updateField("studentName", event.target.value)}
            placeholder="e.g. Aarav Sharma"
            required
            value={values.studentName}
          />
        </FormField>
        <FormField id="parent-name" label="Parent / Guardian Name" required>
          <Input
            autoComplete="name"
            id="parent-name"
            leadingIcon={<UsersRound strokeWidth={2.25} />}
            onChange={(event) => updateField("parentName", event.target.value)}
            placeholder="e.g. Rajesh Sharma"
            required
            value={values.parentName}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 [@media(max-height:700px)]:gap-2">
        <FormField id="student-age" label="Student Age" required>
          <Input
            id="student-age"
            inputMode="numeric"
            leadingIcon={<CalendarDays strokeWidth={2.25} />}
            min={4}
            onChange={(event) => updateField("studentAge", event.target.value)}
            placeholder="e.g. 9"
            required
            type="number"
            value={values.studentAge}
          />
        </FormField>
        <FormField id="contact-number" label="WhatsApp / Phone Number" required>
          <Input
            autoComplete="tel"
            id="contact-number"
            inputMode="tel"
            leadingIcon={<Phone strokeWidth={2.25} />}
            onChange={(event) => updateField("contactNumber", event.target.value)}
            placeholder="98765 43210"
            required
            type="tel"
            value={values.contactNumber}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 [@media(max-height:700px)]:gap-2">
        <AcquisitionSourceSelect
          detail={values.acquisitionDetail}
          onDetailChange={(detail) => updateField("acquisitionDetail", detail)}
          onValueChange={(value) => updateField("acquisitionSource", value)}
          required
          value={values.acquisitionSource}
        />
        <FormField id="email" label="Email Address" required>
          <Input
            autoComplete="email"
            id="email"
            inputMode="email"
            leadingIcon={<AtSign strokeWidth={2.25} />}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="student@example.com"
            required
            type="email"
            value={values.email}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 [@media(max-height:700px)]:gap-2">
        <FormField id="password" label="Password" required>
          <PasswordInput
            autoComplete="new-password"
            id="password"
            leadingIcon={<Lock strokeWidth={2.25} />}
            onChange={(event) => updateField("password", event.target.value)}
            placeholder="8+ chars, letters & numbers"
            required
            value={values.password}
          />
        </FormField>
        <FormField id="confirm-password" label="Confirm Password" required>
          <PasswordInput
            autoComplete="new-password"
            id="confirm-password"
            leadingIcon={<Lock strokeWidth={2.25} />}
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
      <Button className="mt-1 [@media(max-height:700px)]:mt-0" fullWidth isLoading={registerMutation.isPending} type="submit">
        {registerMutation.isPending ? "Submitting..." : "Complete Registration"}
        {!registerMutation.isPending && <ChessKnight aria-hidden="true" className="size-4" strokeWidth={2.5} />}
      </Button>
      <p className="flex items-start justify-center gap-2 text-center text-xs leading-5 text-app-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-ink" strokeWidth={2.5} />
        Our team reviews every registration. You can sign in once it is approved.
      </p>
    </form>
  );
}
