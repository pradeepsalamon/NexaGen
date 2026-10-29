"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  AtSign,
  CheckCircle2,
  Lock,
  Phone,
  UserRound,
  ArrowRight,
  ShieldCheck
} from "lucide-react";
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
  const [acquisitionSource, setAcquisitionSource] = useState<
    AcquisitionSourceValue | ""
  >("");
  const [acquisitionDetail, setAcquisitionDetail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

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

    registerMutation.mutate({
      ...values,
      ...getStoredAcquisition(),
      acquisitionSource,
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
          <h3 className="text-base font-bold">Application received</h3>
          <p className="text-xs opacity-80">
            We have your application for{" "}
            <span className="font-semibold">{submittedEmail}</span>. An admin
            reviews every coach account before it is activated — you will be
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
      {/* Row 1: Full Name & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="coach-name" className={labelBaseClass}>
            Full Name <span className="text-nx-gold-600">*</span>
          </label>
          <Input
            autoComplete="name"
            density="compact"
            id="coach-name"
            leadingIcon={<UserRound />}
            onChange={(e) => updateField("coachName", e.target.value)}
            placeholder="e.g. John Doe"
            required
            type="text"
            value={values.coachName}
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
            placeholder="coach@example.com"
            required
            type="email"
            value={values.email}
          />
        </div>
      </div>

      {/* Row 2: WhatsApp/Phone (Numbers Only) & FIDE Title */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div>
          <label htmlFor="title" className={labelBaseClass}>
            FIDE Title
          </label>
          <Select
            density="compact"
            id="title"
            onChange={(e) =>
              handleTitleChange(e.target.value as RegisterCoachRequest["title"])
            }
            options={titleOptions}
            value={values.title ?? "NONE"}
          />
        </div>
      </div>

      {/* Row 3: FIDE ID & FIDE Rating (ONLY shown when FIDE Title is NOT "NONE") */}
      {hasFideTitle && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          <div>
            <label htmlFor="fide-id" className={labelBaseClass}>
              FIDE ID (Optional)
            </label>
            <Input
              density="compact"
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
          </div>

          <div>
            <label htmlFor="fide-rating" className={labelBaseClass}>
              FIDE Rating (Optional)
            </label>
            <Input
              density="compact"
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
          </div>
        </div>
      )}

      {/* Row 4: Years of Experience & How did you hear about us? */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="years-of-experience" className={labelBaseClass}>
            Years of Experience
          </label>
          <Input
            density="compact"
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
        </div>

        <div className="[&_label]:!text-[11px] [&_label]:!font-bold [&_label]:!mb-1">
          <AcquisitionSourceSelect
            density="compact"
            detail={acquisitionDetail}
            onDetailChange={setAcquisitionDetail}
            onValueChange={setAcquisitionSource}
            required
            value={acquisitionSource}
          />
        </div>
      </div>

      {/* Row 5: Password & Confirm Password */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="coach-password" className={labelBaseClass}>
            Password <span className="text-nx-gold-600">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            density="compact"
            id="coach-password"
            leadingIcon={<Lock />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Create a secure password"
            required
            value={values.password}
          />
        </div>

        <div>
          <label htmlFor="coach-confirm-password" className={labelBaseClass}>
            Confirm Password <span className="text-nx-gold-600">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            density="compact"
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
        </div>
      </div>

      {/* Submit Application Button */}
      <button
        type="submit"
        disabled={registerMutation.isPending}
        className={`mt-1.5 w-full h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer nx-cta`}
      >
        <span>
          {registerMutation.isPending ? "Submitting..." : "Submit application"}
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
          Our team reviews every application. You will be notified by email.
        </span>
      </p>
    </form>
  );
}