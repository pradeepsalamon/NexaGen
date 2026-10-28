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
  UserRound,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/providers/ToastProvider";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  const [values, setValues] = useState<RegisterFormValues>(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
          className="mx-auto size-11 text-emerald-500"
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

  const surfaceInput = isDark
    ? "bg-[#0B1D3F] border-white/15 text-white placeholder:text-[#8E98A8] focus:border-[#E2B355]"
    : "bg-[#F8FAFC] border-[#DCE3EE] text-[#071B41] placeholder:text-[#94A3B8] focus:border-[#C58927]";

  const inputBaseClass = `w-full h-9 sm:h-[38px] pl-8 pr-3 rounded-xl text-xs border outline-none transition-colors ${surfaceInput}`;
  const labelBaseClass = `block text-[11px] font-bold mb-1 ${isDark ? "text-white" : "text-[#071B41]"
    }`;

  return (
    <form className="space-y-2.5" onSubmit={handleSubmit}>
      {/* Row 1: Student Name & Parent Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="student-name" className={labelBaseClass}>
            Student Full Name <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="student-name"
              type="text"
              autoComplete="name"
              required
              placeholder="e.g. Aarav Sharma"
              value={values.studentName}
              onChange={(e) => updateField("studentName", e.target.value)}
              className={inputBaseClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="parent-name" className={labelBaseClass}>
            Parent / Guardian Name <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="parent-name"
              type="text"
              autoComplete="name"
              required
              placeholder="e.g. Rajesh Sharma"
              value={values.parentName}
              onChange={(e) => updateField("parentName", e.target.value)}
              className={inputBaseClass}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Student Age & WhatsApp/Phone (Numbers Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="student-age" className={labelBaseClass}>
            Student Age <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="student-age"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="e.g. 9"
              value={values.studentAge}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 2);
                updateField("studentAge", digitsOnly);
              }}
              className={inputBaseClass}
            />
          </div>
        </div>

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
              className={inputBaseClass}
            />
          </div>
        </div>
      </div>

      {/* Row 3: How did you hear about us? & Email Address */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="[&_label]:!text-[11px] [&_label]:!font-bold [&_label]:!mb-1 [&_select]:!h-9 sm:[&_select]:!h-[38px] [&_select]:!py-0 [&_select]:!rounded-xl [&_select]:!text-xs">
          <AcquisitionSourceSelect
            detail={values.acquisitionDetail}
            onDetailChange={(detail) => updateField("acquisitionDetail", detail)}
            onValueChange={(value) => updateField("acquisitionSource", value)}
            required
            value={values.acquisitionSource}
          />
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
              placeholder="student@example.com"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={inputBaseClass}
            />
          </div>
        </div>
      </div>

      {/* Row 4: Password & Confirm Password */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="password" className={labelBaseClass}>
            Password <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="Create a secure password"
              value={values.password}
              onChange={(e) => updateField("password", e.target.value)}
              className={`${inputBaseClass} pr-8`}
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
          <label htmlFor="confirm-password" className={labelBaseClass}>
            Confirm Password <span className="text-[#C58927]">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#64748B]" />
            <input
              id="confirm-password"
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
              className={`${inputBaseClass} pr-8`}
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

      {/* Submit Button */}
      <button
        type="submit"
        disabled={registerMutation.isPending}
        className={`mt-1.5 w-full h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer ${isDark
            ? "bg-gradient-to-r from-[#E5B85B] via-[#DDA843] to-[#CE942E] text-[#071B41]"
            : "bg-[#071B41] hover:bg-[#0B2559] text-white"
          }`}
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
        className={`flex items-center justify-center gap-1.5 text-center text-[11px] pt-0.5 ${isDark ? "text-[#C1C4CC]" : "text-[#555C68]"
          }`}
      >
        <ShieldCheck
          className="size-3.5 shrink-0 text-emerald-500"
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