"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { forgotPassword } from "../api/authApi";
import { AuthHeader } from "./AuthHeader";

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
        message: `If an account with this email exists, password reset instructions will be sent.${
          data?.resetToken ? ` Dev reset token: ${data.resetToken}` : ""
        }`,
        title: "Reset Request Sent"
      });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    forgotPasswordMutation.mutate({ email });
  }

  return (
    <Card className="w-full max-w-[430px] animate-slide-up p-5 sm:p-6">
        <AuthHeader
          actionHref="/login"
          actionLabel="Back to login"
          helperText="Remembered your password?"
          title="Forgot Password"
        />
        <form className="grid gap-4" onSubmit={handleSubmit}>

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
            {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      </Card>
  );
}
