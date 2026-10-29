"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  AtSign,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  Lock,
  Phone,
  ShieldCheck,
  UserRound
} from "lucide-react";
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
      ...getStoredAcquisition(),
      acquisitionSource: values.acquisitionSource,
      acquisitionDetail: acquisitionDetail.trim() || undefined
    });
  }

  if (submittedEmail) {
    return (
      <div className="grid gap-3 text-center py-4">
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto size-11 text-nx-emerald"
          strokeWidth={2.3}
        />
        <div className="grid gap-1">
          <h3 className="text-base font-bold">Registration received</h3>
          <p className="text-xs opacity-80">
            We have your registration for{" "}
            <span className="font-semibold">{submittedEmail}</span>. An admin
            reviews every student account before it is activated — you will be
            able to sign in once yours is approved.
          </p>
        </div>
        <Link
          href="/login"
          className="mt-1 inline-flex h-10 items-center justify-center rounded-xl border border-current/20 px-4 text-xs font-bold"
        >
          Back to sign in
        </Link>
      </div>
    );
  }


  const labelBaseClass = `block text-[11px] font-bold mb-1 text-nx-ink`;

  return (
    <form className="space-y-2.5" onSubmit={handleSubmit}>
      {/* Row 1: Student Name & Parent Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="student-name" className={labelBaseClass}>
            Student Full Name <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            autoComplete="name"
            density="compact"
            id="student-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("studentName", e.target.value)}
            placeholder="e.g. Aarav Sharma"
            required
            type="text"
            value={values.studentName}
          />
        </div>

        <div>
          <label htmlFor="parent-name" className={labelBaseClass}>
            Parent / Guardian Name <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            autoComplete="name"
            density="compact"
            id="parent-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("parentName", e.target.value)}
            placeholder="e.g. Rajesh Sharma"
            required
            type="text"
            value={values.parentName}
          />
        </div>
      </div>

      {/* Row 2: Student Age & WhatsApp/Phone (Numbers Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="student-age" className={labelBaseClass}>
            Student Age <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            density="compact"
            id="student-age"
            inputMode="numeric"
            leadingIcon={<CalendarDays />}
            onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 2);
                updateField("studentAge", digitsOnly);
              }}
            // 3–99 with no leading zero: the demo form's rule.
            pattern="[3-9]|[1-9][0-9]"
            placeholder="e.g. 9"
            title="Enter an age from 3 to 99."
            required
            type="text"
            value={values.studentAge}
          />
        </div>

        <div>
          <label htmlFor="contact-number" className={labelBaseClass}>
            WhatsApp / Phone Number <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            autoComplete="tel"
            density="compact"
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
        </div>
      </div>

      {/* Row 3: How did you hear about us? & Email Address */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="[&_label]:!text-[11px] [&_label]:!font-bold [&_label]:!mb-1">
          <AcquisitionSourceSelect
            density="compact"
            detail={values.acquisitionDetail}
            onDetailChange={(detail) => updateField("acquisitionDetail", detail)}
            onValueChange={(value) => updateField("acquisitionSource", value)}
            required
            value={values.acquisitionSource}
          />
        </div>

        <div>
          <label htmlFor="email" className={labelBaseClass}>
            Email Address <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            autoComplete="email"
            density="compact"
            id="email"
            inputMode="email"
            leadingIcon={<AtSign />}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="student@example.com"
            required
            type="email"
            value={values.email}
          />
        </div>
      </div>

      {/* Row 4: Password & Confirm Password */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="password" className={labelBaseClass}>
            Password <span className="text-nx-gold-600">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            density="compact"
            id="password"
            leadingIcon={<Lock />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Create a secure password"
            required
            value={values.password}
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className={labelBaseClass}>
            Confirm Password <span className="text-nx-gold-600">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            density="compact"
            id="confirm-password"
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
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={registerMutation.isPending}
        className={`mt-1.5 w-full h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer nx-cta`}
      >
        <span>
          {registerMutation.isPending
            ? "Submitting..."
            : "Complete registration"}
        </span>
        <ArrowRight className="size-4 stroke-[2.4]" />
      </button>

      {/* Approval Note */}
      <p
        className="flex items-center justify-center gap-1.5 text-center text-[11px] pt-0.5 text-nx-body"
      >
        <ShieldCheck
          className="size-3.5 shrink-0 text-nx-emerald"
          strokeWidth={2.4}
        />
        <span>
          Our team reviews every registration. You can sign in once it is
          approved.
        </span>
      </p>
    </form>
  );
}