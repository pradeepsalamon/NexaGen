"use client";

import { useMutation } from "@tanstack/react-query";
import type { AuthUser } from "@nexa-chess/types";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { focusFirstInvalid } from "@/lib/forms";
import { useToast } from "@/providers/ToastProvider";
import { verifyMfa } from "../../api/authApi";

type MfaCodeStepProps = {
  challengeToken: string;
  onCancel: () => void;
  onVerified: (user: AuthUser) => void;
};

/** Second login step for an account with two-factor on. Accepts a recovery code too. */
export function MfaCodeStep({ challengeToken, onCancel, onVerified }: MfaCodeStepProps) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const verify = useMutation({
    mutationFn: () => verifyMfa({ challengeToken, code: code.trim() }),
    onError: (error) => {
      // A lockout (429) stays under the field: it says how long to wait. Anything else is a toast.
      if (!isLockout(error)) toast.error({ message: getErrorMessage(error), title: "Code not accepted" });
    },
    onSuccess: ({ user }) => onVerified(user)
  });
  const lockout = verify.isError && isLockout(verify.error) ? getErrorMessage(verify.error) : undefined;
  const codeError = submitted && code.trim().length < 6
    ? "Enter the 6-digit code"
    : lockout ?? (verify.isError ? "Check the code and try again" : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (code.trim().length < 6) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    verify.mutate();
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
      <p className="text-sm text-app-muted">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>
      <FormField
        error={codeError}
        id="mfa-code"
        label="Verification code"
      >
        <Input
          autoComplete="one-time-code"
          autoFocus
          hasError={Boolean(codeError)}
          id="mfa-code"
          inputMode="text"
          maxLength={20}
          onChange={(event) => {
            setCode(event.target.value);
            if (verify.isError) verify.reset();
          }}
          placeholder="123456"
          value={code}
        />
      </FormField>
      <Button fullWidth isLoading={verify.isPending} type="submit">
        Verify
      </Button>
      <Button fullWidth onClick={onCancel} type="button" variant="neutral">
        Use a different account
      </Button>
    </form>
  );
}

function isLockout(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}
