"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { FormField } from "../../../components/ui/FormField";
import { Input } from "../../../components/ui/Input";
import { getErrorMessage } from "../../../lib/errors";
import { useToast } from "../../../providers/ToastProvider";
import { forgotPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => {
      toast.danger({
        message: getErrorMessage(error),
        title: "Reset request failed"
      });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    forgotPasswordMutation.mutate({ email });
  }

  return (
    <AuthLayout eyebrow="Account help" title="Recover your access.">
      <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <AuthHeader
          actionHref="/login"
          actionLabel="Back to login"
          helperText="Remembered your password?"
          title="Forgot Password"
        />
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {forgotPasswordMutation.error ? (
            <p className="rounded-control border border-app-danger bg-[color-mix(in_srgb,var(--color-danger)_8%,var(--color-surface))] px-3.5 py-3 text-sm text-app-danger">
              {forgotPasswordMutation.error.message}
            </p>
          ) : null}
          {forgotPasswordMutation.data ? (
            <p className="rounded-control border border-[color-mix(in_srgb,var(--color-accent)_48%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-surface))] px-3.5 py-3 text-sm text-app-text">
              If an account with this email exists, password reset instructions
              will be sent.{" "}
              {forgotPasswordMutation.data.resetToken
                ? `Dev reset token: ${forgotPasswordMutation.data.resetToken}`
                : null}
            </p>
          ) : null}
          <FormField
            hint="Enter the email linked to your student account."
            id="forgot-email"
            label="Email Address"
          >
            <Input
              autoComplete="email"
              id="forgot-email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student@example.com"
              required
              type="email"
              value={email}
            />
          </FormField>
          <Button
            fullWidth
            isLoading={forgotPasswordMutation.isPending}
            type="submit"
          >
            {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
