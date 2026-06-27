"use client";

import { LogOut } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";
import { useAuthStore } from "../../../stores/authStore";
import { logout } from "../api/authApi";

export function LogoutButton() {
  const router = useRouter();
  const clearSession = useAuthStore((state) => state.clearSession);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearSession();
      router.replace("/login");
      router.refresh();
    }
  });

  return (
    <Button
      aria-label="Logout"
      className="gap-2"
      disabled={logoutMutation.isPending}
      onClick={() => logoutMutation.mutate()}
      variant="ghost"
    >
      <LogOut aria-hidden="true" className="size-4" strokeWidth={2.5} />
      <span>{logoutMutation.isPending ? "Logging out..." : "Logout"}</span>
    </Button>
  );
}
