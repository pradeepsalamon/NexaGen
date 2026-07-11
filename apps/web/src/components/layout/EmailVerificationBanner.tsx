"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { resendVerification } from "@/features/auth/api/authApi";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";

export function EmailVerificationBanner() {
  const user = useAuthStore((state) => state.user);
  const toast = useToast();
  const [isSent, setIsSent] = useState(false);

  const resendMutation = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => {
      setIsSent(true);
      toast.success({
        title: "Email Sent",
        message: "A new verification link has been sent to your email address."
      });
    },
    onError: (error) => {
      toast.error({
        title: "Failed to send",
        message: getErrorMessage(error)
      });
    }
  });

  if (!user || user.isEmailVerified) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-sm flex items-center justify-center gap-4 fixed top-16 w-full z-30">
      <p>
        Please verify your email address to unlock all features.
      </p>
      <button
        className="font-medium underline hover:text-yellow-900 disabled:opacity-50"
        disabled={resendMutation.isPending || isSent}
        onClick={() => resendMutation.mutate()}
      >
        {isSent ? "Verification sent" : resendMutation.isPending ? "Sending..." : "Resend verification email"}
      </button>
    </div>
  );
}
