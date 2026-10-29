"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { forgotPassword } from "../api/authApi";
import { AuthSplitShell } from "./AuthSplitShell";

export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Reset request failed"
      });
    },
    onSuccess: (data) => {
      toast.success({
        message: `If an account with this email exists, password reset instructions will be sent.${data?.resetToken ? ` Dev reset token: ${data.resetToken}` : ""
          }`,
        title: "Reset Request Sent"
      });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    forgotPasswordMutation.mutate({ email });
  }

  return (
    <AuthSplitShell variant="forgot-password" cardMaxWidthClass="max-w-[430px]">
      {/* Centered Gold Lock Icon Badge */}
      <div className="flex flex-col items-center text-center mb-6">
        <div
          className="
            size-14 rounded-full mb-4
            flex items-center justify-center
            bg-nx-gold-tint
            border border-nx-gold-line-medium
            text-nx-gold-ink
            shadow-xs
          "
        >
          <Lock className="size-6" strokeWidth={2.2} />
        </div>

        <h2 className="font-display text-2xl sm:text-[28px] font-bold text-nx-ink leading-tight">
          Forgot Password?
        </h2>

        <p className="text-xs sm:text-sm text-nx-body mt-2 max-w-[330px] leading-relaxed">
          Enter the email address associated with your Nexa Chess account and
          we&apos;ll send you a reset link.
        </p>
      </div>

      {/* Form */}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-xs font-bold text-nx-ink mb-1.5"
          >
            Email address
          </label>
          <Input
            autoComplete="email"
            id="forgot-email"
            inputMode="email"
            leadingIcon={<Mail strokeWidth={2} />}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            required
            type="email"
            value={email}
          />
        </div>

        {/* Send Reset Link Button */}
        <button
          type="submit"
          disabled={forgotPasswordMutation.isPending}
          className="
            w-full h-11 sm:h-12 rounded-xl font-bold text-sm
            inline-flex items-center justify-center gap-2
            nx-cta
            shadow-md transition-all duration-200 hover:-translate-y-0.5
            disabled:opacity-60 cursor-pointer
          "
        >
          <span>
            {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
          </span>
          <ArrowRight className="size-4 stroke-[2.4]" />
        </button>

        {/* Bottom Back to Login Link */}
        <p className="text-center text-xs text-nx-body pt-2">
          Remembered your password?{" "}
          <Link
            href="/login"
            className="font-bold text-nx-gold-ink hover:underline"
          >
            Back to login
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}