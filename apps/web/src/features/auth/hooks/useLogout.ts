"use client";

import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useRouter } from "@/lib/navigation";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { logout } from "../api/authApi";

/** True when the sign-out really happened, or there was no session left to end. */
export function logoutEndedSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Signs out, and leaves the page only once the server has ended the session.
 * A failed request (network, 5xx) used to clear the store and open /login
 * anyway; the cookies were still valid, so the middleware sent the user
 * straight back in, signed in, on a device they believed they had signed out
 * of (FE review AU2). Now a failure keeps them where they are with a retry.
 * A 401 means the session was already gone, which is a sign-out too.
 */
export function useLogout(onSignedOut?: () => void) {
  const router = useRouter();
  const toast = useToast();
  const clearSession = useAuthStore((state) => state.clearSession);

  const finish = () => {
    onSignedOut?.();
    clearSession();
    router.replace("/login");
    router.refresh();
  };

  return useMutation({
    mutationFn: logout,
    onError: (error) => {
      if (logoutEndedSession(error)) {
        finish();
        return;
      }
      toast.error({
        message: "You are still signed in on this device. Check your connection and try again.",
        title: "Couldn't sign you out"
      });
    },
    onSuccess: () => {
      toast.success({
        message: "You have been signed out.",
        title: "Logout successful"
      });
      finish();
    }
  });
}
