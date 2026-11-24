"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getErrorMessage } from "@/lib/errors";
import { focusFirstInvalid, getConfirmPasswordError, getNewPasswordError } from "@/lib/forms";
import { useToast } from "@/providers/ToastProvider";
import { resetPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";
import { AuthCard } from "../login-v2/AuthFrame";
import { AuthStatus } from "./AuthStatus";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ confirmPassword: false, password: false });
  const passwordError = getNewPasswordError(touched.password, password);
  const confirmError = getConfirmPasswordError(touched.confirmPassword, confirmPassword, password);
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

    setTouched({ confirmPassword: true, password: true });
    if (getNewPasswordError(true, password) || getConfirmPasswordError(true, confirmPassword, password)) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    resetPasswordMutation.mutate({ confirmPassword, password, token });
  }

  if (!token) {
    return (
      <AuthCard>
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
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeader
        description="Use at least 8 characters, with at least one letter and one number."
        title="Reset your password"
      />
      <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
        <FormField error={passwordError} id="reset-password" label="New password">
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(passwordError)}
            id="reset-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            required
            value={password}
          />
        </FormField>
        <FormField error={confirmError} id="reset-confirm-password" label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            hasError={Boolean(confirmError)}
            id="reset-confirm-password"
            minLength={8}
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
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
    </AuthCard>
  );
}
