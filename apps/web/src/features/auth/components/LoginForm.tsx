"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useMutation } from "@tanstack/react-query";
import {
  type AuthUser,
  isMfaChallenge,
  type MfaChallengeResponse
} from "@nexa-chess/types";
import { useRouter } from "@/lib/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Lock, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { ApiError } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import { focusFirstInvalid } from "@/lib/forms";
import type { LoginFormValues } from "../types/auth";
import { validateLoginForm } from "../validation/authValidation";
import { login } from "../api/authApi";
import { MfaCodeStep } from "./mfa/MfaCodeStep";
import { MfaEnrollment } from "./mfa/MfaEnrollment";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { AuthHeader } from "./AuthHeader";
import { AuthSplitShell } from "./AuthSplitShell";

const initialValues: LoginFormValues = {
  email: "",
  password: "",
  rememberMe: false
};

export function LoginForm() {
  const brandName = useBrandName();
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

  const [lockout, setLockout] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: login,
    onError: (error) => {
      // Too many attempts: the wait time has to stay on screen while they wait, so it sits
      // under the password field instead of in a toast that fades.
      if (error instanceof ApiError && error.status === 429) {
        setLockout(getErrorMessage(error));
        return;
      }
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
      message: `Welcome back to ${brandName}.`,
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
    setLockout(null);

    if (validateLoginForm(values, { email: true, password: true }).email || !values.password.trim()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    loginMutation.mutate(values);
  }

  if (challenge) {
    const enrolling = challenge.mfaRequired === "SETUP";
    return (
      <AuthSplitShell variant="login">
        <AuthHeader
          description={
            enrolling
              ? "Your account needs a second step at sign-in. This takes a minute."
              : "One more step to confirm it's you."
          }
          title={enrolling ? "Set up two-factor sign-in" : "Two-factor sign-in"}
        />
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
    <AuthSplitShell variant="login">
      <AuthHeader
        description="Continue your chess journey with expert coaching and a global community."
        title="Welcome back"
      />

      <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
        <FormField error={errors.email} id="email" label="Email address">
          <Input
            autoComplete="email"
            id="email"
            hasError={Boolean(errors.email)}
            inputMode="email"
            leadingIcon={<Mail strokeWidth={2.25} />}
            onBlur={() => touchField("email")}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={values.email}
          />
        </FormField>

        <FormField error={errors.password ?? lockout ?? undefined} id="password" label="Password">
          <PasswordInput
            autoComplete="current-password"
            id="password"
            hasError={Boolean(errors.password ?? lockout)}
            leadingIcon={<Lock strokeWidth={2.25} />}
            onBlur={() => touchField("password")}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Enter your password"
            required
            value={values.password}
          />
        </FormField>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label
            className="inline-flex min-h-[var(--control-h-sm)] cursor-pointer items-center gap-2 text-sm text-app-text"
            htmlFor="remember-me"
          >
            <Checkbox
              checked={values.rememberMe}
              id="remember-me"
              onCheckedChange={(checked) => updateField("rememberMe", checked === true)}
            />
            Remember me
          </label>

          <Link
            className="text-sm font-medium text-primary-ink hover:underline"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>

        <Button fullWidth isLoading={loginMutation.isPending} size="lg" type="submit">
          {loginMutation.isPending ? "Logging in…" : "Log in"}
        </Button>

        <p className="text-center text-sm text-app-muted">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-primary-ink hover:underline" href="/register">
            Create account
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}
