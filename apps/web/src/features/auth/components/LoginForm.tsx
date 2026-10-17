"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { type AuthUser, isMfaChallenge, type MfaChallengeResponse } from "@nexa-chess/types";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import type { LoginFormValues } from "../types/auth";
import { validateLoginForm } from "../validation/authValidation";
import { login } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { MfaCodeStep } from "./mfa/MfaCodeStep";
import { MfaEnrollment } from "./mfa/MfaEnrollment";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";


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

  if (challenge) {
    const enrolling = challenge.mfaRequired === "SETUP";
    return (
      <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <h1 className="mb-1 text-2xl font-extrabold leading-tight text-app-text">
          {enrolling ? "Set up two-factor sign-in" : "Two-factor sign-in"}
        </h1>
        <p className="mb-4 text-sm leading-6 text-app-muted">
          {enrolling
            ? "Your account needs a second step at sign-in. This takes a minute."
            : "One more step to confirm it's you."}
        </p>
        {enrolling ? (
          <MfaEnrollment
            challengeToken={challenge.challengeToken}
            onCancel={resetChallenge}
            onComplete={(result) => (result.user ? finishLogin(result.user) : resetChallenge())}
          />
        ) : (
          <MfaCodeStep
            challengeToken={challenge.challengeToken}
            onCancel={resetChallenge}
            onVerified={finishLogin}
          />
        )}
      </Card>
    );
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

  return (
    <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <AuthHeader
          actionHref="/register"
          actionLabel="Create account"
          helperText="New to Nexa Chess?"
          title="Log in"
        />
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>

          <FormField error={errors.email} id="email" label="Email">
            <Input
              autoComplete="email"
              hasError={Boolean(errors.email)}
              id="email"
              inputMode="email"
              onBlur={() => touchField("email")}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="student@example.com"
              type="email"
              value={values.email}
            />
          </FormField>
          <FormField error={errors.password} id="password" label="Password">
            <PasswordInput
              autoComplete="current-password"
              hasError={Boolean(errors.password)}
              id="password"
              onBlur={() => touchField("password")}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="Enter your password"
              value={values.password}
            />
          </FormField>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox
              checked={values.rememberMe}
              id="remember-me"
              label="Remember me"
              onCheckedChange={(checked) =>
                updateField("rememberMe", !!checked)
              }
            />
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <Button fullWidth isLoading={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </Card>
  );
}
