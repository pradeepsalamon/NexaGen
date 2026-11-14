"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { getEmailVerificationStatus, resendVerification } from "@/features/auth/api/authApi";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";

export function EmailVerificationBanner() {
  const user = useAuthStore((state) => state.user);
  const toast = useToast();
  const [isSent, setIsSent] = useState(false);

  // Verified accounts never ask; the server's answer outlives a stale stored user.
  const status = useQuery({
    enabled: !!user && !user.isEmailVerified,
    queryFn: getEmailVerificationStatus,
    queryKey: queryKeys.auth.emailVerification
  });

  // undo: intentionally excluded — an email cannot be unsent.
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

  if (!user || user.isEmailVerified || !status.data || status.data.isEmailVerified || status.data.policy === "OFF") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-secondary/40 bg-secondary/10 px-4 py-2 text-sm text-secondary-ink">
      <p>Please verify your email address, {user.email}.</p>
      <Button
        disabled={resendMutation.isPending || isSent}
        onClick={() => resendMutation.mutate()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isSent ? "Verification sent" : resendMutation.isPending ? "Sending..." : "Resend verification email"}
      </Button>
    </div>
  );
}
