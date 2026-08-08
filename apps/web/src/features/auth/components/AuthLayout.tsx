"use client";

import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/PageContainer";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

  useEffect(() => {
    if (searchParams.get("reason") === "unauthorized") {
      // Force a refetch to allow the interceptor to attempt a token refresh
      queryClient.resetQueries({ queryKey: ["auth", "me"] });
      router.replace("/login");
      return;
    }

    if (isSessionChecked && user) {
      router.replace(getRoleDashboardHref(user.role));
    }
  }, [isSessionChecked, user, searchParams, router, queryClient]);

  if (!isSessionChecked || user) {
    return null;
  }

  return (
    <PageContainer>
      <div className="mx-auto grid min-h-[calc(100vh-5.5rem)] max-w-6xl animate-fade-in lg:min-h-[calc(100vh-6.5rem)] lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)] lg:items-stretch lg:gap-3">
        <section
          className="relative hidden min-h-0 flex-col gap-4 overflow-hidden rounded-panel border border-app-border bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-primary)_22%,var(--color-surface)),color-mix(in_srgb,var(--color-accent)_22%,var(--color-surface)))] p-6 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-primary)_18%,transparent)_1px,transparent_1px),linear-gradient(color-mix(in_srgb,var(--color-primary)_16%,transparent)_1px,transparent_1px)] before:bg-[length:42px_42px] before:opacity-30 lg:flex lg:max-h-[calc(100vh-6.5rem)]"
          aria-labelledby="auth-hero-title"
        >
          <div className="relative z-10 mx-auto my-auto flex max-w-2xl flex-col items-center text-center">
            <Logo size={200} stacked />
            <span className="block max-w-lg text-sm leading-6 text-app-muted md:text-base">
              Premium chess learning for focused students and families.
            </span>
          </div>
        </section>
        <section
          className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center rounded-panel border border-app-border bg-app-surface/90 p-3 lg:max-h-[calc(100vh-6.5rem)] lg:min-h-0 lg:overflow-y-auto lg:p-2"
          aria-label="Authentication form"
        >
          {children}
        </section>
      </div>
    </PageContainer>
  );
}
