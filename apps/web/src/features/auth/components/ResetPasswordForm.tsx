"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { resetPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { AuthSplitShell } from "./AuthSplitShell";
import { AuthStatus } from "./AuthStatus";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const token = searchParams.get("token") ?? "";
  const resetPasswordMutation = useMutation({
    mutationFn: resetPassword,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Password reset failed"
      });
    },
    onSuccess: () => {
      toast.success({
        message: "You can now log in with your new password.",
        title: "Password updated"
      });
      router.push("/login");
    }
  });


  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      const confirmPasswordInput = event.currentTarget.elements.namedItem(
        "confirmPassword"
      );

      if (confirmPasswordInput instanceof HTMLInputElement) {
        confirmPasswordInput.setCustomValidity("Passwords must match.");
        confirmPasswordInput.reportValidity();
      }

      return;
    }

    resetPasswordMutation.mutate({ confirmPassword, password, token });
  }

  if (!token) {
    return (
      <AuthSplitShell variant="forgot-password">
        <AuthStatus
          actions={
            <>
              <Button asChild>
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
              <Button asChild variant="neutral">
                <Link href="/login">Back to log in</Link>
              </Button>
            </>
          }
          title="This reset link is incomplete"
          tone="error"
        >
          The link is missing its reset code. Open the latest link from your email, or
          request a new one.
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell variant="forgot-password">
      <AuthHeader
        description="Use at least 8 characters, with at least one letter and one number."
        title="Reset your password"
      />
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <FormField id="reset-password" label="New password">
          <PasswordInput
            autoComplete="new-password"
            id="reset-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            required
            value={password}
          />
        </FormField>
        <FormField id="reset-confirm-password" label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            id="reset-confirm-password"
            minLength={8}
            name="confirmPassword"
            onChange={(event) => {
              event.target.setCustomValidity("");
              setConfirmPassword(event.target.value);
            }}
            placeholder="Confirm your password"
            required
            value={confirmPassword}
          />
        </FormField>
        <Button fullWidth isLoading={resetPasswordMutation.isPending} size="lg" type="submit">
          {resetPasswordMutation.isPending ? "Resetting…" : "Reset password"}
        </Button>
        <p className="text-center text-sm text-app-muted">
          Password already updated?{" "}
          <Link className="font-medium text-primary-ink hover:underline" href="/login">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthSplitShell>
  );
}
