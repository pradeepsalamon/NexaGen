"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
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
import { useTouchedFields } from "../hooks/useTouchedFields";
import type { LoginFormValues } from "../types/auth";
import { validateLoginForm } from "../validation/authValidation";
import { login } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { AuthLayout } from "./AuthLayout";
import { useAuthStore } from "@/stores/authStore";

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
    onSuccess: ({ user }) => {
      const nextUrl =
        new URLSearchParams(window.location.search).get("next") ??
        (user.role === "SUPER_ADMIN" ? "/dashboard/super-admin" : "/");

      setUser(user);
      toast.success({
        message: "Welcome back to NexaGen Chess.",
        title: "Login successful"
      });
      router.push(nextUrl);
    }
  });

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
    <AuthLayout eyebrow="Welcome back" title="Continue your chess journey.">
      <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <AuthHeader
          actionHref="/register"
          actionLabel="Create account"
          helperText="New to NexaGen Chess?"
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
          <div className="flex flex-wrap items-center justify-between gap-2 max-sm:flex-col max-sm:items-start">
            <Checkbox
              checked={values.rememberMe}
              id="remember-me"
              label="Remember me"
              onCheckedChange={(checked) =>
                updateField("rememberMe", !!checked)
              }
            />
            <Link href="/forgot-password">Forgot Password?</Link>
          </div>
          <Button fullWidth isLoading={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
