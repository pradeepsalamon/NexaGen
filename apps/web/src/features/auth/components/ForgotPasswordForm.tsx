"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { forgotPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { AuthSplitShell } from "./AuthSplitShell";
import { AuthStatus } from "./AuthStatus";

export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Reset request failed"
      });
    },
    onSuccess: (data, variables) => {
      setSentTo(variables.email);
      toast.success({
        message: `If an account with this email exists, password reset instructions will be sent.${data?.resetToken ? ` Dev reset token: ${data.resetToken}` : ""
          }`,
        title: "Reset request sent"
      });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    forgotPasswordMutation.mutate({ email });
  }

  if (sentTo) {
    return (
      <AuthSplitShell variant="forgot-password">
        <AuthStatus
          actions={
            <>
              <Button asChild>
                <Link href="/login">Back to log in</Link>
              </Button>
              <Button onClick={() => setSentTo(null)} variant="neutral">
                Use a different email
              </Button>
            </>
          }
          title="Check your email"
          tone="info"
        >
          If an account exists for{" "}
          <span className="font-semibold text-app-text">{sentTo}</span>, we&apos;ve sent a
          link to reset its password.
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell variant="forgot-password">
      <AuthHeader
        description="Enter the email address of your Nexa Chess account and we'll send you a reset link."
        title="Forgot your password?"
      />

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <FormField id="forgot-email" label="Email address">
          <Input
            autoComplete="email"
            id="forgot-email"
            inputMode="email"
            leadingIcon={<Mail strokeWidth={2.25} />}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={email}
          />
        </FormField>

        <Button fullWidth isLoading={forgotPasswordMutation.isPending} size="lg" type="submit">
          {forgotPasswordMutation.isPending ? "Sending…" : "Send reset link"}
        </Button>

        <p className="text-center text-sm text-app-muted">
          Remembered your password?{" "}
          <Link className="font-medium text-primary-ink hover:underline" href="/login">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}
