"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { resetPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";

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

  return (
    <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <AuthHeader
          actionHref="/login"
          actionLabel="Back to login"
          helperText="Password already updated?"
          title="Reset password"
        />
        <form className="grid gap-4" onSubmit={handleSubmit}>

          {!token ? (
            <p className="rounded-control border border-[color-mix(in_srgb,var(--color-warm)_48%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warm)_18%,var(--color-surface))] px-3.5 py-3 text-sm text-app-text">
              Reset token is missing from the link.
            </p>
          ) : null}
          <FormField id="reset-password" label="New Password">
            <PasswordInput
              autoComplete="new-password"
              id="reset-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create password"
              required
              value={password}
            />
          </FormField>
          <FormField id="reset-confirm-password" label="Confirm Password">
            <PasswordInput
              autoComplete="new-password"
              id="reset-confirm-password"
              minLength={8}
              name="confirmPassword"
              onChange={(event) => {
                event.target.setCustomValidity("");
                setConfirmPassword(event.target.value);
              }}
              placeholder="Confirm password"
              required
              value={confirmPassword}
            />
          </FormField>
          <Button
            disabled={resetPasswordMutation.isPending || !token}
            fullWidth
            isLoading={resetPasswordMutation.isPending}
            type="submit"
          >
            {resetPasswordMutation.isPending ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </Card>
  );
}
