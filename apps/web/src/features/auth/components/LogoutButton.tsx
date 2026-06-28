"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "../../../components/common/ConfirmationModal";
import { Button } from "../../../components/ui/Button";
import { getErrorMessage } from "../../../lib/errors";
import { useToast } from "../../../providers/ToastProvider";
import { useAuthStore } from "../../../stores/authStore";
import { logout } from "../api/authApi";

export function LogoutButton() {
  const router = useRouter();
  const toast = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const clearSession = useAuthStore((state) => state.clearSession);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onError: (error) => {
      toast.danger({
        message: getErrorMessage(error),
        title: "Logout request failed"
      });
    },
    onSuccess: () => {
      toast.success({
        message: "You have been signed out.",
        title: "Logout successful"
      });
    },
    onSettled: () => {
      setIsConfirmOpen(false);
      clearSession();
      router.replace("/login");
      router.refresh();
    }
  });

  return (
    <>
      <Button
        aria-label="Logout"
        disabled={logoutMutation.isPending}
        onClick={() => setIsConfirmOpen(true)}
        variant="secondary"
      >
        <LogOut aria-hidden="true" className="size-4" strokeWidth={2.5} />
        <span>{logoutMutation.isPending ? "Logging out..." : "Logout"}</span>
      </Button>
      <ConfirmationModal
        cancelLabel="Stay logged in"
        confirmLabel="Logout"
        isConfirming={logoutMutation.isPending}
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => logoutMutation.mutate()}
        title="Logout?"
      >
        You will need to sign in again to access your dashboard.
      </ConfirmationModal>
    </>
  );
}
