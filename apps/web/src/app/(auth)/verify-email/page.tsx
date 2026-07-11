"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { verifyEmail } from "@/features/auth/api/authApi";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import { AuthHeader } from "@/features/auth/components/AuthHeader";
import { Button } from "@/components/ui/Button";

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
    <Card className="w-full max-w-[440px] animate-slide-up p-4 sm:p-5 text-center">
      <AuthHeader
        actionHref="/login"
        actionLabel="Log in"
        helperText="Already verified?"
        title="Email Verification"
      />
      
      <div className="py-6">
        {status === "loading" && (
          <p className="text-gray-600">Verifying your email address, please wait...</p>
        )}
        
        {status === "success" && (
          <div className="text-green-600 flex flex-col items-center gap-4">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>Email verified successfully! Redirecting you...</p>
          </div>
        )}
        
        {status === "error" && (
          <div className="text-red-600 flex flex-col items-center gap-4">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p className="text-gray-900">{errorMsg}</p>
            <Button onClick={() => router.push("/login")} variant="outline" className="mt-4">
              Return to Login
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
