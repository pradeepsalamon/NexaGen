"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const user = useAuthStore((state) => state.user);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const unauthorizedReason = searchParams.get("reason") === "unauthorized";

  useEffect(() => {
    if (unauthorizedReason) {
      queryClient.resetQueries({ queryKey: queryKeys.auth.session });
      router.replace("/login");
    }
  }, [unauthorizedReason, router, queryClient]);

  useEffect(() => {
    if (isSessionChecked && user) {
      router.replace(getRoleDashboardHref(user.role));
    }
  }, [isSessionChecked, user, router]);

  if (!isSessionChecked || user) {
    return null;
  }

  return <>{children}</>;
}