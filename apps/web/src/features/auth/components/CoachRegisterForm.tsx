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
  ShieldCheck,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/providers/ToastProvider";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  const [values, setValues] = useState<RegisterCoachRequest>(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
          className="mx-auto size-11 text-emerald-500"
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

  const surfaceInput = isDark
    ? "bg-[#0B1D3F] border-white/15 text-white placeholder:text-[#8E98A8] focus:border-[#E2B355]"
    : "bg-[#F8FAFC] border-[#DCE3EE] text-[#071B41] placeholder:text-[#94A3B8] focus:border-[#C58927]";

  const inputWithIconClass = `w-full h-9 sm:h-[38px] pl-8 pr-3 rounded-xl text-xs border outline-none transition-colors ${surfaceInput}`;
  const inputPlainClass = `w-full h-9 sm:h-[38px] px-3 rounded-xl text-xs border outline-none transition-colors ${surfaceInput}`;
  const labelBaseClass = `block text-[11px] font-bold mb-1 ${isDark ? "text-white" : "text-[#071B41]"
    }`;

  return (
    <form className="space-y-2.5" onSubmit={handleSubmit}>
      {/* Row 1: Full Name & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="coach-name" className={labelBaseClass}>
            Full Name <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="coach-name"
              type="text"
              autoComplete="name"
              required
              placeholder="e.g. John Doe"
              value={values.coachName}
              onChange={(e) => updateField("coachName", e.target.value)}
              className={inputWithIconClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className={labelBaseClass}>
            Email Address <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <AtSign className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="coach@example.com"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={inputWithIconClass}
            />
          </div>
        </div>
      </div>

      {/* Row 2: WhatsApp/Phone (Numbers Only) & FIDE Title */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="contact-number" className={labelBaseClass}>
            WhatsApp / Phone Number <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="contact-number"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel"
              required
              maxLength={15}
              placeholder="9876543210"
              value={values.contactNumber}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 15);
                updateField("contactNumber", digitsOnly);
              }}
              className={inputWithIconClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="title" className={labelBaseClass}>
            FIDE Title
          </label>
          <select
            id="title"
            value={values.title ?? "NONE"}
            onChange={(e) =>
              handleTitleChange(
                e.target.value as RegisterCoachRequest["title"]
              )
            }
            className={inputPlainClass}
          >
            {titleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: FIDE ID & FIDE Rating (ONLY shown when FIDE Title is NOT "NONE") */}
      {hasFideTitle && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          <div>
            <label htmlFor="fide-id" className={labelBaseClass}>
              FIDE ID (Optional)
            </label>
            <input
              id="fide-id"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456"
              value={values.fideId ?? ""}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 12);
                updateField("fideId", digitsOnly);
              }}
              className={inputPlainClass}
            />
          </div>

          <div>
            <label htmlFor="fide-rating" className={labelBaseClass}>
              FIDE Rating (Optional)
            </label>
            <input
              id="fide-rating"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 2000"
              value={values.fideRating ?? ""}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 4);
                const val = parseInt(digitsOnly, 10);
                updateField("fideRating", Number.isNaN(val) ? undefined : val);
              }}
              className={inputPlainClass}
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
          <input
            id="years-of-experience"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 5"
            value={values.yearsOfExperience ?? ""}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 2);
              const val = parseInt(digitsOnly, 10);
              updateField(
                "yearsOfExperience",
                Number.isNaN(val) ? undefined : val
              );
            }}
            className={inputPlainClass}
          />
        </div>

        <div className="[&_label]:!text-[11px] [&_label]:!font-bold [&_label]:!mb-1 [&_select]:!h-9 sm:[&_select]:!h-[38px] [&_select]:!py-0 [&_select]:!rounded-xl [&_select]:!text-xs">
          <AcquisitionSourceSelect
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
            Password <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="coach-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="Create a secure password"
              value={values.password}
              onChange={(e) => updateField("password", e.target.value)}
              className={`${inputWithIconClass} pr-8`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label="Toggle password visibility"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B]"
            >
              {showPassword ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="coach-confirm-password" className={labelBaseClass}>
            Confirm Password <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="coach-confirm-password"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="Confirm your password"
              value={values.confirmPassword}
              onChange={(e) => {
                e.target.setCustomValidity("");
                updateField("confirmPassword", e.target.value);
              }}
              className={`${inputWithIconClass} pr-8`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((p) => !p)}
              aria-label="Toggle confirm password visibility"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B]"
            >
              {showConfirm ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Submit Application Button */}
      <button
        type="submit"
        disabled={registerMutation.isPending}
        className={`mt-1.5 w-full h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer ${isDark
            ? "bg-gradient-to-r from-[#E5B85B] via-[#DDA843] to-[#CE942E] text-[#071B41]"
            : "bg-[#071B41] hover:bg-[#0B2559] text-white"
          }`}
      >
        <span>
          {registerMutation.isPending ? "Submitting..." : "Submit application"}
        </span>
        <ArrowRight className="size-4 stroke-[2.4]" />
      </button>

      {/* Approval Note */}
      <p
        className={`flex items-center justify-center gap-1.5 text-center text-[11px] pt-0.5 ${isDark ? "text-[#C1C4CC]" : "text-[#555C68]"
          }`}
      >
        <ShieldCheck
          className="size-3.5 shrink-0 text-emerald-500"
          strokeWidth={2.4}
        />
        <span>
          Our team reviews every application. You will be notified by email.
        </span>
      </p>
    </form>
  );
}