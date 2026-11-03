"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { verifyEmail } from "../api/authApi";
import { AuthSplitShell } from "./AuthSplitShell";
import { AuthStatus } from "./AuthStatus";

export function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const verifyMutation = useMutation({
    mutationFn: verifyEmail,
    onSuccess: () => {
      setStatus("success");
      toast.success({
        title: "Email verified",
        message: "Your email address has been successfully verified."
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    },
    onError: (error) => {
      setStatus("error");
      setErrorMsg(getErrorMessage(error));
    }
  });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Verification token is missing.");
      return;
    }

    verifyMutation.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthSplitShell variant="forgot-password">
      {status === "loading" && (
        <AuthStatus title="Verifying your email" tone="loading">
          This takes a moment.
        </AuthStatus>
      )}

      {status === "success" && (
        <AuthStatus title="Email verified" tone="success">
          Taking you to Nexa Chess…
        </AuthStatus>
      )}

      {status === "error" && (
        <AuthStatus
          actions={
            <Button asChild variant="neutral">
              <Link href="/login">Back to log in</Link>
            </Button>
          }
          title="We couldn't verify your email"
          tone="error"
        >
          {errorMsg}
        </AuthStatus>
      )}
    </AuthSplitShell>
  );
}
