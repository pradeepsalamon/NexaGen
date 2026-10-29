"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  type AuthUser,
  isMfaChallenge,
  type MfaChallengeResponse
} from "@nexa-chess/types";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import type { LoginFormValues } from "../types/auth";
import { validateLoginForm } from "../validation/authValidation";
import { login } from "../api/authApi";
import { MfaCodeStep } from "./mfa/MfaCodeStep";
import { MfaEnrollment } from "./mfa/MfaEnrollment";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { AuthSplitShell } from "./AuthSplitShell";

const initialValues: LoginFormValues = {
  email: "",
  password: "",
  rememberMe: false
};

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const [values, setValues] = useState<LoginFormValues>(initialValues);
  const [challenge, setChallenge] = useState<MfaChallengeResponse | null>(null);
  const { touched, touchAll, touchField } = useTouchedFields<LoginFormValues>();
  const errors = useMemo(
    () => validateLoginForm(values, touched),
    [touched, values]
  );

  const loginMutation = useMutation({
    mutationFn: login,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Login failed"
      });
    },
    onSuccess: (response) => {
      if (isMfaChallenge(response)) {
        setChallenge(response);
        return;
      }
      finishLogin(response.user);
    }
  });

  function finishLogin(user: AuthUser) {
    setUser(user);
    toast.success({
      message: "Welcome back to Nexa Chess.",
      title: "Login successful"
    });
    router.push(getRoleDashboardHref(user.role));
  }

  function resetChallenge() {
    setChallenge(null);
    setValues((currentValues) => ({ ...currentValues, password: "" }));
  }

  function updateField<TField extends keyof LoginFormValues>(
    field: TField,
    value: LoginFormValues[TField]
  ) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    touchAll(values);

    if (!values.email.trim() || !values.password.trim()) {
      return;
    }

    loginMutation.mutate(values);
  }

  if (challenge) {
    const enrolling = challenge.mfaRequired === "SETUP";
    return (
      <AuthSplitShell variant="login" cardMaxWidthClass="max-w-[440px]">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-nx-ink mb-1.5">
          {enrolling ? "Set up two-factor sign-in" : "Two-factor sign-in"}
        </h1>
        <p className="text-xs sm:text-sm text-nx-body mb-5">
          {enrolling
            ? "Your account needs a second step at sign-in. This takes a minute."
            : "One more step to confirm it's you."}
        </p>
        {enrolling ? (
          <MfaEnrollment
            challengeToken={challenge.challengeToken}
            onCancel={resetChallenge}
            onComplete={(result) =>
              result.user ? finishLogin(result.user) : resetChallenge()
            }
          />
        ) : (
          <MfaCodeStep
            challengeToken={challenge.challengeToken}
            onCancel={resetChallenge}
            onVerified={finishLogin}
          />
        )}
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell variant="login" cardMaxWidthClass="max-w-[440px]">
      {/* Card Header */}
      <div className="mb-6">
        <h2 className="font-display text-2xl sm:text-[30px] font-bold text-nx-ink leading-tight">
          Welcome Back
        </h2>
        <p className="text-xs sm:text-sm text-nx-body mt-1.5 leading-relaxed">
          Continue your chess journey with expert coaching and a global community.
        </p>
      </div>

      {/* Form */}
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {/* Email Field */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-bold text-nx-ink mb-1.5"
          >
            Email address
          </label>
          <Input
            autoComplete="email"
            id="email"
            hasError={Boolean(errors.email)}
            inputMode="email"
            leadingIcon={<Mail strokeWidth={2} />}
            onBlur={() => touchField("email")}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="student@nexa.test"
            type="email"
            value={values.email}
          />
          {errors.email && (
            <p className="mt-1 text-xs font-medium text-nx-live">{errors.email}</p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-bold text-nx-ink mb-1.5"
          >
            Password
          </label>
          <PasswordInput
            autoComplete="current-password"
            id="password"
            hasError={Boolean(errors.password)}
            leadingIcon={<Lock strokeWidth={2} />}
            onBlur={() => touchField("password")}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Enter your password"
            value={values.password}
          />
          {errors.password && (
            <p className="mt-1 text-xs font-medium text-nx-live">
              {errors.password}
            </p>
          )}
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between pt-0.5">
          <label
            htmlFor="remember-me"
            className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-nx-body"
          >
            <Checkbox
              checked={values.rememberMe}
              id="remember-me"
              onCheckedChange={(checked) => updateField("rememberMe", checked === true)}
            />
            <span>Remember me</span>
          </label>

          <Link
            href="/forgot-password"
            className="text-xs font-bold text-nx-gold-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit Button (Navy in Light Mode, Gold in Dark Mode) */}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="
            w-full h-11 sm:h-12 rounded-xl font-bold text-sm
            inline-flex items-center justify-center gap-2
            nx-cta
            shadow-md transition-all duration-200 hover:-translate-y-0.5
            disabled:opacity-60 disabled:pointer-events-none cursor-pointer
          "
        >
          <span>{loginMutation.isPending ? "Logging in..." : "Log in"}</span>
          <ArrowRight className="size-4 stroke-[2.4]" />
        </button>

        {/* Bottom Switch to Register */}
        <p className="text-center text-xs text-nx-body pt-2">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-bold text-nx-gold-ink hover:underline"
          >
            Create account
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}