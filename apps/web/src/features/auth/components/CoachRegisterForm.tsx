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
import { focusFirstInvalid, getConfirmPasswordError, getEmailError, getFieldError, getNewPasswordError } from "@/lib/forms";
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
  const [touched, setTouched] = useState<Partial<Record<CoachField, boolean>>>({});
  const errors = validateCoach(values, acquisitionSource, touched);

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

    const all = Object.fromEntries(COACH_FIELDS.map((field) => [field, true]));
    setTouched(all);
    const blocked = Object.values(validateCoach(values, acquisitionSource, all)).some(Boolean);
    if (!acceptedTerms) setTermsError(TERMS_REQUIRED_MESSAGE);
    if (blocked) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    // Already reported above; narrows the type for the request.
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
    <form className="grid gap-6 lg:gap-3" noValidate onSubmit={handleSubmit}>
      <RegistrationFieldset legend="About you">
        <FormField error={errors.coachName} id="coach-name" label="Full name" required>
          <Input
            autoComplete="name"
            hasError={Boolean(errors.coachName)}
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

            <FormField error={errors.fideRating} id="fide-rating" label="FIDE rating (optional)">
              <Input
                hasError={Boolean(errors.fideRating)}
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

        <FormField error={errors.yearsOfExperience} id="years-of-experience" label="Years of experience">
          <Input
            hasError={Boolean(errors.yearsOfExperience)}
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
          error={errors.acquisitionSource}
          onValueChange={setAcquisitionSource}
          required
          value={acquisitionSource}
        />
      </RegistrationFieldset>

      <RegistrationFieldset legend="Contact and account">
        <FormField error={errors.email} id="email" label="Email address" required>
          <Input
            autoComplete="email"
            hasError={Boolean(errors.email)}
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

        <FormField error={errors.contactNumber} id="contact-number" label="WhatsApp or phone number" required>
          <Input
            autoComplete="tel"
            hasError={Boolean(errors.contactNumber)}
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

        <FormField error={errors.password} id="coach-password" label="Password" required>
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(errors.password)}
            id="coach-password"
            leadingIcon={<Lock />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Create a secure password"
            required
            value={values.password}
          />
        </FormField>

        <FormField error={errors.confirmPassword} id="coach-confirm-password" label="Confirm password" required>
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(errors.confirmPassword)}
            id="coach-confirm-password"
            leadingIcon={<Lock />}
            name="confirmPassword"
            onChange={(e) => {
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

      <div className="grid gap-3 lg:gap-2">
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
        {/* From `lg` it sits under the page heading instead (RegisterPageClient). */}
        <LoginPrompt className="lg:hidden" />
      </div>
    </form>
  );
}

const COACH_FIELDS = [
  "coachName",
  "fideRating",
  "yearsOfExperience",
  "acquisitionSource",
  "email",
  "contactNumber",
  "password",
  "confirmPassword"
] as const;
type CoachField = (typeof COACH_FIELDS)[number];

/** Field messages; the limits are the API's (`RegisterCoachDto`): rating 0–4000, experience 0–80. */
function validateCoach(
  values: Omit<RegisterCoachRequest, "acceptedTerms">,
  acquisitionSource: string,
  touched: Partial<Record<CoachField, boolean>>
): Partial<Record<CoachField, string>> {
  return {
    acquisitionSource: getFieldError(Boolean(touched.acquisitionSource), acquisitionSource, "Choose an option"),
    coachName: getFieldError(Boolean(touched.coachName), values.coachName, "Enter your full name"),
    confirmPassword: getConfirmPasswordError(Boolean(touched.confirmPassword), values.confirmPassword, values.password),
    contactNumber: getFieldError(Boolean(touched.contactNumber), values.contactNumber, "Enter a phone number"),
    email: getEmailError(Boolean(touched.email), values.email),
    fideRating:
      touched.fideRating && values.fideRating !== undefined && values.fideRating > 4000
        ? "Enter a rating up to 4000"
        : undefined,
    password: getNewPasswordError(Boolean(touched.password), values.password),
    yearsOfExperience:
      touched.yearsOfExperience && values.yearsOfExperience !== undefined && values.yearsOfExperience > 80
        ? "Enter up to 80 years"
        : undefined
  };
}
