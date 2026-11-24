"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { type FormEvent, useRef, useState } from "react";
import { AtSign, CalendarDays, Lock, Phone, ShieldCheck, UserRound } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { getStoredAcquisition } from "@/lib/acquisition";
import { focusFirstInvalid } from "@/lib/forms";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import { ALL_REGISTER_FIELDS_TOUCHED, validateRegisterForm } from "../validation/authValidation";
import { register } from "../api/authApi";
import type { RegisterFormValues } from "../types/auth";
import { AcquisitionSourceSelect } from "./AcquisitionSourceSelect";
import { AuthStatus } from "./AuthStatus";
import { LoginPrompt, TERMS_REQUIRED_MESSAGE, TermsConsent } from "./RegistrationConsent";
import { RegistrationFieldset } from "./RegistrationFieldset";

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | undefined>();
  const termsRef = useRef<HTMLButtonElement>(null);
  const { touched, touchAll } = useTouchedFields<RegisterFormValues>();
  const errors = validateRegisterForm(values, touched);

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

    touchAll(values);
    const blocked = Object.values(validateRegisterForm(values, ALL_REGISTER_FIELDS_TOUCHED)).some(Boolean);
    if (!acceptedTerms) setTermsError(TERMS_REQUIRED_MESSAGE);
    if (blocked) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    // Already reported above; narrows the type for the request.
    if (!values.acquisitionSource) return;

    if (!acceptedTerms) {
      setTermsError(TERMS_REQUIRED_MESSAGE);
      termsRef.current?.focus();
      return;
    }

    const { acquisitionDetail, ...rest } = values;
    registerMutation.mutate({
      ...rest,
      ...getStoredAcquisition(),
      acceptedTerms: true,
      acquisitionSource: values.acquisitionSource,
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
        title="Registration received"
        tone="success"
      >
        We have your registration for{" "}
        <span className="font-semibold text-app-text">{submittedEmail}</span>. An admin
        reviews every student account before it is activated. You can sign in once yours
        is approved.
      </AuthStatus>
    );
  }

  return (
    <form className="grid gap-6 lg:gap-3" noValidate onSubmit={handleSubmit}>
      <RegistrationFieldset legend="Student">
        <FormField error={errors.studentName} id="student-name" label="Student's full name" required>
          <Input
            autoComplete="name"
            hasError={Boolean(errors.studentName)}
            id="student-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("studentName", e.target.value)}
            placeholder="e.g. Aarav Sharma"
            required
            type="text"
            value={values.studentName}
          />
        </FormField>

        <FormField error={errors.studentAge} id="student-age" label="Student's age" required>
          <Input
            hasError={Boolean(errors.studentAge)}
            id="student-age"
            inputMode="numeric"
            leadingIcon={<CalendarDays />}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 2);
              updateField("studentAge", digitsOnly);
            }}
            // 3–99 with no leading zero (validateRegisterForm); a hint for keyboards and autofill.
            pattern="[3-9]|[1-9][0-9]"
            placeholder="e.g. 9"
            required
            type="text"
            value={values.studentAge}
          />
        </FormField>
      </RegistrationFieldset>

      <RegistrationFieldset legend="Parent or guardian contact">
        <FormField error={errors.parentName} id="parent-name" label="Parent or guardian name" required>
          <Input
            autoComplete="name"
            hasError={Boolean(errors.parentName)}
            id="parent-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("parentName", e.target.value)}
            placeholder="e.g. Rajesh Sharma"
            required
            type="text"
            value={values.parentName}
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
      </RegistrationFieldset>

      <RegistrationFieldset legend="Account">
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

        <AcquisitionSourceSelect
          detail={values.acquisitionDetail}
          onDetailChange={(detail) => updateField("acquisitionDetail", detail)}
          error={errors.acquisitionSource}
          onValueChange={(value) => updateField("acquisitionSource", value)}
          required
          value={values.acquisitionSource}
        />

        <FormField error={errors.password} id="password" label="Password" required>
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(errors.password)}
            id="password"
            leadingIcon={<Lock />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Create a secure password"
            required
            value={values.password}
          />
        </FormField>

        <FormField error={errors.confirmPassword} id="confirm-password" label="Confirm password" required>
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(errors.confirmPassword)}
            id="confirm-password"
            leadingIcon={<Lock />}
            name="confirmPassword"
            onChange={(e) => updateField("confirmPassword", e.target.value)}
            placeholder="Confirm your password"
            required
            value={values.confirmPassword}
          />
        </FormField>
      </RegistrationFieldset>

      <TermsConsent
        checked={acceptedTerms}
        error={termsError}
        id="student-accept-terms"
        onCheckedChange={(checked) => {
          setAcceptedTerms(checked);
          if (checked) setTermsError(undefined);
        }}
        ref={termsRef}
      />

      <div className="grid gap-3 lg:gap-2">
        <Button fullWidth isLoading={registerMutation.isPending} size="lg" type="submit">
          {registerMutation.isPending ? "Submitting…" : "Complete registration"}
        </Button>
        <p className="flex items-start justify-center gap-2 text-center text-sm text-app-muted">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-success-ink"
            strokeWidth={2.25}
          />
          Our team reviews every registration. You can sign in once it is approved.
        </p>
        <LoginPrompt />
      </div>
    </form>
  );
}
