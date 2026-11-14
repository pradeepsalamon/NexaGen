"use client";

import { useMutation } from "@tanstack/react-query";
import type { AuthUser } from "@nexa-chess/types";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/errors";
import { verifyMfa } from "../../api/authApi";

type MfaCodeStepProps = {
  challengeToken: string;
  onCancel: () => void;
  onVerified: (user: AuthUser) => void;
};

/** Second login step for an account with two-factor on. Accepts a recovery code too. */
export function MfaCodeStep({ challengeToken, onCancel, onVerified }: MfaCodeStepProps) {
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () => verifyMfa({ challengeToken, code: code.trim() }),
    onSuccess: ({ user }) => onVerified(user)
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim().length >= 6) verify.mutate();
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
      <p className="text-sm text-app-muted">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>
      <FormField
        error={verify.isError ? getErrorMessage(verify.error) : undefined}
        id="mfa-code"
        label="Verification code"
      >
        <Input
          autoComplete="one-time-code"
          autoFocus
          hasError={verify.isError}
          id="mfa-code"
          maxLength={20}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          value={code}
        />
      </FormField>
      <Button fullWidth isLoading={verify.isPending} type="submit">
        Verify
      </Button>
      <Button fullWidth onClick={onCancel} type="button" variant="ghost">
        Use a different account
      </Button>
    </form>
  );
}
