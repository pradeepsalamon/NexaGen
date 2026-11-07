"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { type FormEvent, useRef, useState } from "react";
import { AtSign, Lock, Phone, ShieldCheck, UserRound } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { getStoredAcquisition } from "@/lib/acquisition";
import { registerCoach } from "../api/authApi";
import type {
  AcquisitionSourceValue,
  RegisterCoachRequest
} from "@nexa-chess/types";
import { AcquisitionSourceSelect } from "./AcquisitionSourceSelect";
import { AuthStatus } from "./AuthStatus";
import { LoginPrompt, TERMS_REQUIRED_MESSAGE, TermsConsent } from "./RegistrationConsent";
import { RegistrationFieldset } from "./RegistrationFieldset";

const titleOptions: { label: string; value: string }[] = [
  { label: "None", value: "NONE" },
  { label: "Candidate Master (CM)", value: "CM" },
  { label: "FIDE Master (FM)", value: "FM" },
  { label: "International Master (IM)", value: "IM" },
  { label: "Grandmaster (GM)", value: "GM" }
];

// The checkbox is its own state; the request gets `acceptedTerms: true` once it is ticked.
const initialValues: Omit<RegisterCoachRequest, "acceptedTerms"> = {
  coachName: "",
  contactNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
  title: "NONE"
};

export function CoachRegisterForm() {
  const toast = useToast();

  const [values, setValues] = useState<Omit<RegisterCoachRequest, "acceptedTerms">>(initialValues);
  const [acquisitionSource, setAcquisitionSource] = useState<
    AcquisitionSourceValue | ""
  >("");
  const [acquisitionDetail, setAcquisitionDetail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | undefined>();
  const termsRef = useRef<HTMLButtonElement>(null);

  const hasFideTitle = Boolean(values.title && values.title !== "NONE");

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

  function handleTitleChange(nextTitle: RegisterCoachRequest["title"]) {
    setValues((currentValues) => ({
      ...currentValues,
      title: nextTitle,
      // Clear FIDE ID and FIDE Rating if user switches back to "NONE"
      ...(nextTitle === "NONE" ? { fideId: undefined, fideRating: undefined } : {})
    }));
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

    if (!acquisitionSource) return;

    if (!acceptedTerms) {
      setTermsError(TERMS_REQUIRED_MESSAGE);
      termsRef.current?.focus();
      return;
    }

    registerMutation.mutate({
      ...values,
      ...getStoredAcquisition(),
      acceptedTerms: true,
      acquisitionSource,
      acquisitionDetail: acquisitionDetail.trim() || undefined
    });
  }

  if (submittedEmail) {
    return (
      <AuthStatus
        actions={
          <Button asChild variant="neutral">
            <Link href="/login">Back to log in</Link>
          </Button>
        }
        headingLevel="h2"
        title="Application received"
        tone="success"
      >
        We have your application for{" "}
        <span className="font-semibold text-app-text">{submittedEmail}</span>. An admin
        reviews every coach account before it is activated. You can sign in once yours is
        approved.
      </AuthStatus>
    );
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <RegistrationFieldset legend="About you">
        <FormField id="coach-name" label="Full name" required>
          <Input
            autoComplete="name"
            id="coach-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("coachName", e.target.value)}
            placeholder="e.g. John Doe"
            required
            type="text"
            value={values.coachName}
          />
        </FormField>

        <FormField id="title" label="FIDE title">
          <Select
            id="title"
            onChange={(e) =>
              handleTitleChange(e.target.value as RegisterCoachRequest["title"])
            }
            options={titleOptions}
            value={values.title ?? "NONE"}
          />
        </FormField>

        {/* FIDE ID and rating only once a title is chosen. */}
        {hasFideTitle && (
          <>
            <FormField id="fide-id" label="FIDE ID (optional)">
              <Input
                id="fide-id"
                inputMode="numeric"
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 12);
                  updateField("fideId", digitsOnly);
                }}
                pattern="[0-9]*"
                placeholder="123456"
                type="text"
                value={values.fideId ?? ""}
              />
            </FormField>

            <FormField id="fide-rating" label="FIDE rating (optional)">
              <Input
                id="fide-rating"
                inputMode="numeric"
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 4);
                  const val = parseInt(digitsOnly, 10);
                  updateField("fideRating", Number.isNaN(val) ? undefined : val);
                }}
                pattern="[0-9]*"
                placeholder="e.g. 2000"
                type="text"
                value={values.fideRating ?? ""}
              />
            </FormField>
          </>
        )}

        <FormField id="years-of-experience" label="Years of experience">
          <Input
            id="years-of-experience"
            inputMode="numeric"
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 2);
              const val = parseInt(digitsOnly, 10);
              updateField(
                "yearsOfExperience",
                Number.isNaN(val) ? undefined : val
              );
            }}
            pattern="[0-9]*"
            placeholder="e.g. 5"
            type="text"
            value={values.yearsOfExperience ?? ""}
          />
        </FormField>

        <AcquisitionSourceSelect
          detail={acquisitionDetail}
          onDetailChange={setAcquisitionDetail}
          onValueChange={setAcquisitionSource}
          required
          value={acquisitionSource}
        />
      </RegistrationFieldset>

      <RegistrationFieldset legend="Contact and account">
        <FormField id="email" label="Email address" required>
          <Input
            autoComplete="email"
            id="email"
            inputMode="email"
            leadingIcon={<AtSign />}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={values.email}
          />
        </FormField>

        <FormField id="contact-number" label="WhatsApp or phone number" required>
          <Input
            autoComplete="tel"
            id="contact-number"
            inputMode="numeric"
            leadingIcon={<Phone />}
            maxLength={15}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 15);
              updateField("contactNumber", digitsOnly);
            }}
            pattern="[0-9]*"
            placeholder="9876543210"
            required
            type="tel"
            value={values.contactNumber}
          />
        </FormField>

        <FormField id="coach-password" label="Password" required>
          <PasswordInput
            autoComplete="new-password"
            id="coach-password"
            leadingIcon={<Lock />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Create a secure password"
            required
            value={values.password}
          />
        </FormField>

        <FormField id="coach-confirm-password" label="Confirm password" required>
          <PasswordInput
            autoComplete="new-password"
            id="coach-confirm-password"
            leadingIcon={<Lock />}
            name="confirmPassword"
            onChange={(e) => {
              e.target.setCustomValidity("");
              updateField("confirmPassword", e.target.value);
            }}
            placeholder="Confirm your password"
            required
            value={values.confirmPassword}
          />
        </FormField>
      </RegistrationFieldset>

      <TermsConsent
        checked={acceptedTerms}
        error={termsError}
        id="coach-accept-terms"
        onCheckedChange={(checked) => {
          setAcceptedTerms(checked);
          if (checked) setTermsError(undefined);
        }}
        ref={termsRef}
      />

      <div className="grid gap-3">
        <Button fullWidth isLoading={registerMutation.isPending} size="lg" type="submit">
          {registerMutation.isPending ? "Submitting…" : "Submit application"}
        </Button>
        <p className="flex items-start justify-center gap-2 text-center text-sm text-app-muted">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-success-ink"
            strokeWidth={2.25}
          />
          Our team reviews every application. You will be notified by email.
        </p>
        <LoginPrompt />
      </div>
    </form>
  );
}
