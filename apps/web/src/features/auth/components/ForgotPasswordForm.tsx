"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Lock, Mail, ArrowRight } from "lucide-react";
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
            bg-[#FDF4E1] dark:bg-[#E2B355]/15
            border border-[#F3DFB6] dark:border-[#E2B355]/30
            text-[#C58927] dark:text-[#E2B355]
            shadow-xs
          "
        >
          <Lock className="size-6" strokeWidth={2.2} />
        </div>

        <h2 className="font-[family-name:var(--font-playfair)] text-2xl sm:text-[28px] font-bold text-[#071B41] dark:text-white leading-tight">
          Forgot Password?
        </h2>

        <p className="text-xs sm:text-sm text-[#555C68] dark:text-[#C1C4CC] mt-2 max-w-[330px] leading-relaxed">
          Enter the email address associated with your Nexa Chess account and
          we&apos;ll send you a reset link.
        </p>
      </div>

      {/* Form */}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-xs font-bold text-[#071B41] dark:text-white mb-1.5"
          >
            Email address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#64748B] dark:text-[#94A3B8]"
              strokeWidth={2}
            />
            <input
              id="forgot-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="student@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="
                w-full h-11 pl-10 pr-4 rounded-xl text-sm
                bg-[#F8FAFC] dark:bg-[#0B1D3F]
                border border-[#DCE3EE] dark:border-white/15
                focus:border-[#C58927] dark:focus:border-[#E2B355]
                text-[#071B41] dark:text-white placeholder:text-[#94A3B8]
                outline-none transition-colors
              "
            />
          </div>
        </div>

        {/* Send Reset Link Button */}
        <button
          type="submit"
          disabled={forgotPasswordMutation.isPending}
          className="
            w-full h-11 sm:h-12 rounded-xl font-bold text-sm
            inline-flex items-center justify-center gap-2
            bg-[#071B41] hover:bg-[#0B2559] text-white
            dark:bg-gradient-to-r dark:from-[#E5B85B] dark:via-[#DDA843] dark:to-[#CE942E]
            dark:hover:from-[#ECC36B] dark:hover:to-[#D89E35]
            dark:text-[#071B41]
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
        <p className="text-center text-xs text-[#555C68] dark:text-[#C1C4CC] pt-2">
          Remembered your password?{" "}
          <Link
            href="/login"
            className="font-bold text-[#C58927] dark:text-[#E2B355] hover:underline"
          >
            Back to login
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}