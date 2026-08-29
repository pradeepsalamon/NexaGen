"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { registerCoach } from "../api/authApi";
import type { RegisterCoachRequest } from "@nexa-chess/types";

const titleOptions: { label: string; value: string }[] = [
  { label: "None", value: "NONE" },
  { label: "Candidate Master (CM)", value: "CM" },
  { label: "FIDE Master (FM)", value: "FM" },
  { label: "International Master (IM)", value: "IM" },
  { label: "Grandmaster (GM)", value: "GM" }
];

const initialValues: RegisterCoachRequest = {
  coachName: "",
  contactNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
  title: "NONE"
};

export function CoachRegisterForm() {
  const toast = useToast();
  const [values, setValues] = useState<RegisterCoachRequest>(initialValues);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Registration is an application, not a sign-in: the API issues no session
  // until an admin approves the coach, so there is nothing to redirect to.
  const registerMutation = useMutation({
    mutationFn: registerCoach,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Registration failed"
      });
    },
    onSuccess: ({ email }) => {
      setSubmittedEmail(email);
      toast.success({
        message: "Your application is submitted and under review.",
        title: "Application received"
      });
    }
  });

  function updateField<TField extends keyof RegisterCoachRequest>(
    field: TField,
    value: RegisterCoachRequest[TField]
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

    registerMutation.mutate(values);
  }

  if (submittedEmail) {
    return (
      <div className="grid gap-4 text-center">
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto size-12 text-primary"
          strokeWidth={2.5}
        />
        <div className="grid gap-1.5">
          <h2 className="text-lg font-semibold text-app-text">
            Application received
          </h2>
          <p className="text-sm text-app-muted">
            We have your application for{" "}
            <span className="font-medium text-app-text">{submittedEmail}</span>.
            An admin reviews every coach account before it is activated — you
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
    <form className="grid gap-3.5" onSubmit={handleSubmit}>
      <FormField id="coach-name" label="Full Name">
          <Input
            autoComplete="name"
            id="coach-name"
            onChange={(event) => updateField("coachName", event.target.value)}
            placeholder="John Doe"
            required
            value={values.coachName}
          />
        </FormField>
        
        <div className="grid gap-3.5 md:grid-cols-2">
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
              placeholder="coach@example.com"
              required
              type="email"
              value={values.email}
            />
          </FormField>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <FormField id="title" label="FIDE Title">
            <Select
              id="title"
              onChange={(event) =>
                updateField(
                  "title",
                  event.target.value as RegisterCoachRequest["title"]
                )
              }
              options={titleOptions}
              placeholder="Choose Title"
              value={values.title ?? "NONE"}
            />
          </FormField>
          <FormField id="fide-id" label="FIDE ID (Optional)">
            <Input
              id="fide-id"
              onChange={(event) => updateField("fideId", event.target.value)}
              placeholder="123456"
              value={values.fideId ?? ""}
            />
          </FormField>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <FormField id="fide-rating" label="FIDE Rating (Optional)">
            <Input
              id="fide-rating"
              inputMode="numeric"
              onChange={(event) =>
                updateField("fideRating", parseInt(event.target.value) || undefined)
              }
              placeholder="e.g. 2000"
              type="number"
              value={values.fideRating ?? ""}
            />
          </FormField>
          <FormField id="years-of-experience" label="Years of Experience">
            <Input
              id="years-of-experience"
              inputMode="numeric"
              onChange={(event) =>
                updateField("yearsOfExperience", parseInt(event.target.value) || undefined)
              }
              placeholder="e.g. 5"
              type="number"
              value={values.yearsOfExperience ?? ""}
            />
          </FormField>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <FormField id="password" label="Password">
            <PasswordInput
              autoComplete="new-password"
              id="password"
              onChange={(event) => updateField("password", event.target.value)}
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
          {registerMutation.isPending ? "Submitting..." : "Submit Application"}
        </Button>
      </form>
  );
}
