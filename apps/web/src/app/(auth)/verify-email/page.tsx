"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";
import { verifyEmail } from "@/features/auth/api/authApi";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { AuthHeader } from "@/features/auth/components/AuthHeader";
import { Button } from "@/components/ui/Button";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();
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
      <div className="text-center">
        <AuthHeader
          actionHref="/login"
          actionLabel="Log in"
          helperText="Already verified?"
          title="Email Verification"
        />
        
        <div className="py-6">
          {status === "loading" && (
            <p className="text-app-muted">Verifying your email address, please wait...</p>
          )}
          
          {status === "success" && (
            <div className="text-success-ink flex flex-col items-center gap-4">
              <CheckCircle2 aria-hidden="true" className="size-12" strokeWidth={2} />
              <p>Email verified successfully! Redirecting you...</p>
            </div>
          )}
          
          {status === "error" && (
            <div className="text-app-danger flex flex-col items-center gap-4">
              <AlertCircle aria-hidden="true" className="size-12" strokeWidth={2} />
              <p className="text-app-text">{errorMsg}</p>
              <Button onClick={() => router.push("/login")} variant="outline" className="mt-4">
                Return to Login
              </Button>
            </div>
          )}
      </div>
      </div>
    </AuthSplitShell>
  );
}
