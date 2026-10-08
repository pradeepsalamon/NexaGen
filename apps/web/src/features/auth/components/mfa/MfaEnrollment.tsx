"use client";

import { useMutation } from "@tanstack/react-query";
import type { MfaEnableResponse } from "@nexa-chess/types";
import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { enableMfa, startMfaSetup } from "../../api/authApi";

type MfaEnrollmentProps = {
  /** Set when enrolling as the second step of a login. */
  challengeToken?: string;
  onCancel?: () => void;
  onComplete: (result: MfaEnableResponse) => void;
};

/** Scan → confirm a code → save recovery codes. */
export function MfaEnrollment({ challengeToken, onCancel, onComplete }: MfaEnrollmentProps) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState<MfaEnableResponse | null>(null);
  const started = useRef(false);

  const setup = useMutation({ mutationFn: () => startMfaSetup(challengeToken) });
  const enable = useMutation({
    mutationFn: () => enableMfa({ challengeToken, code: code.trim() }),
    onSuccess: setEnabled
  });

  useEffect(() => {
    // Each call issues a new secret, so only ever start once per mount.
    if (started.current) return;
    started.current = true;
    setup.mutate();
  }, [setup]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (/^\d{6}$/.test(code.trim())) enable.mutate();
  }

  async function copyRecoveryCodes(codes: string[]) {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success({ title: "Recovery codes copied" });
  }

  if (enabled) {
    return (
      <div className="grid gap-4">
        <Alert title="Save your recovery codes" variant="warning">
          Each code signs you in once if you lose your phone. They won&apos;t be shown again.
        </Alert>
        <ul className="grid grid-cols-2 gap-2 rounded-control border border-app-border bg-app-background p-3 font-mono text-sm text-app-text">
          {enabled.recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => copyRecoveryCodes(enabled.recoveryCodes)} variant="outline">
            <Copy className="size-4" strokeWidth={2.5} />
            Copy codes
          </Button>
          <Button onClick={() => onComplete(enabled)}>I&apos;ve saved them</Button>
        </div>
      </div>
    );
  }

  if (setup.isError) {
    return (
      <Alert
        action={
          <Button onClick={() => setup.mutate()} size="sm" variant="outline">
            Retry
          </Button>
        }
        variant="error"
      >
        {getErrorMessage(setup.error)}
      </Alert>
    );
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
      <p className="text-sm text-app-muted">
        Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator,
        1Password…), then enter the 6-digit code it shows.
      </p>
      {setup.data ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-control bg-white p-3">
            <QRCodeSVG aria-label="Authenticator setup QR code" size={168} value={setup.data.otpauthUrl} />
          </div>
          <p className="text-center text-xs text-app-muted">
            Can&apos;t scan? Enter this key:{" "}
            <span className="break-all font-mono text-app-text">
              {setup.data.secret.match(/.{1,4}/g)?.join(" ")}
            </span>
          </p>
        </div>
      ) : (
        <Skeleton className="mx-auto size-[192px]" />
      )}
      <FormField
        error={enable.isError ? getErrorMessage(enable.error) : undefined}
        id="mfa-enroll-code"
        label="6-digit code"
      >
        <Input
          autoComplete="one-time-code"
          hasError={enable.isError}
          id="mfa-enroll-code"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          value={code}
        />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
        )}
        <Button
          disabled={!setup.data || code.length !== 6}
          isLoading={enable.isPending}
          type="submit"
        >
          Turn on two-factor
        </Button>
      </div>
    </form>
  );
}
