"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { useLogout } from "../hooks/useLogout";

export function LogoutButton() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Leaves the page only once the server ended the session (FE review AU2).
  const logoutMutation = useLogout(() => setIsConfirmOpen(false));

  return (
    <>
      <Button
        aria-label="Logout"
        disabled={logoutMutation.isPending}
        onClick={() => setIsConfirmOpen(true)}
        variant="neutral"
      >
        <LogOut aria-hidden="true" className="size-4" strokeWidth={2.5} />
        <span>{logoutMutation.isPending ? "Logging out..." : "Logout"}</span>
      </Button>
      <ConfirmationModal
        cancelLabel="Stay logged in"
        confirmLabel="Logout"
        icon={LogOut}
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
