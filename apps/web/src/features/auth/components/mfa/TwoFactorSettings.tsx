"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { disableMfa, getMfaStatus } from "../../api/authApi";
import { MfaEnrollment } from "./MfaEnrollment";

/** Profile → "Two-factor sign-in". Staff only; students never see it. */
export function TwoFactorSettings() {
  const role = useAuthStore((state) => state.user?.role);
  if (!role || role === "STUDENT") return null;
  return <TwoFactorPanel />;
}

function TwoFactorPanel() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const [mode, setMode] = useState<"idle" | "enroll" | "disable">("idle");
  const [code, setCode] = useState("");

  const status = useQuery({ queryFn: getMfaStatus, queryKey: queryKeys.auth.mfa });
  const disable = useMutation({
    mutationFn: () => disableMfa({ code: code.trim() }),
    onSuccess: ({ signedOut }) => {
      setMode("idle");
      setCode("");
      if (signedOut) {
        toast.info({
          message: "Sign in again to set up a new authenticator.",
          title: "Two-factor turned off"
        });
        clearSession();
        router.push("/login");
        return;
      }
      toast.success({ title: "Two-factor turned off" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfa });
    }
  });

  function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim().length >= 6) disable.mutate();
  }

  return (
    <section
      aria-labelledby="two-factor-heading"
      className="mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-app-text" id="two-factor-heading">
          Two-factor sign-in
        </h2>
        {status.data && (
          <Badge variant={status.data.enabled ? "success" : "secondary"}>
            {status.data.enabled ? "On" : "Off"}
          </Badge>
        )}
      </div>
      <p className="mb-4 mt-1 text-sm text-app-muted">
        Ask for a code from your authenticator app after your password.
      </p>

      {status.isLoading && <Skeleton className="h-10 w-48" />}
      {status.isError && <Alert variant="error">{getErrorMessage(status.error)}</Alert>}

      {status.data && !status.data.available && !status.data.enabled && (
        <Alert variant="info">Two-factor sign-in isn&apos;t configured on this server yet.</Alert>
      )}

      {status.data?.available && !status.data.enabled && mode !== "enroll" && (
        <div className="grid gap-3">
          {status.data.required && (
            <Alert variant="warning">
              Your role requires two-factor sign-in. You&apos;ll be asked to set it up next time you
              log in.
            </Alert>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setMode("enroll")}>Set up two-factor</Button>
          </div>
        </div>
      )}

      {mode === "enroll" && (
        <MfaEnrollment
          onCancel={() => setMode("idle")}
          onComplete={() => {
            setMode("idle");
            toast.success({ title: "Two-factor sign-in is on" });
            void queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfa });
          }}
        />
      )}

      {status.data?.enabled && mode !== "disable" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-app-muted">
            {status.data.recoveryCodesRemaining} recovery code
            {status.data.recoveryCodesRemaining === 1 ? "" : "s"} left.
          </p>
          <Button onClick={() => setMode("disable")} variant="outline">
            Turn off
          </Button>
        </div>
      )}

      {mode === "disable" && (
        <form className="grid gap-3" noValidate onSubmit={handleDisable}>
          {status.data?.required && (
            <Alert variant="warning">
              Your role requires two-factor sign-in, so you&apos;ll be signed out everywhere and asked
              to set up a new authenticator.
            </Alert>
          )}
          <FormField
            error={disable.isError ? getErrorMessage(disable.error) : undefined}
            id="mfa-disable-code"
            label="Current code or a recovery code"
          >
            <Input
              autoComplete="one-time-code"
              hasError={disable.isError}
              id="mfa-disable-code"
              maxLength={20}
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMode("idle")} type="button" variant="ghost">
              Cancel
            </Button>
            <Button isLoading={disable.isPending} type="submit" variant="destructive">
              Turn off two-factor
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
