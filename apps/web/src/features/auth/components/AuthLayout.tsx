"use client";

import type { ReactNode } from "react";
import { ChessKnight, Crown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeroFeatureCarousel } from "./HeroFeatureCarousel";
import { PageContainer } from "@/components/PageContainer";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
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
      // Force a refetch to allow the interceptor to attempt a token refresh
      queryClient.resetQueries({ queryKey: queryKeys.auth.session });
      router.replace("/login");
    }
    // Keyed on the primitive reason, not `searchParams`/`user` — those change
    // on every session refetch (a fresh `user` object each time), which would
    // re-fire this before router.replace's URL update lands and re-trigger
    // resetQueries forever, hammering /auth/me in a tight loop.
  }, [unauthorizedReason, router, queryClient]);

  useEffect(() => {
    if (isSessionChecked && user) {
      router.replace(getRoleDashboardHref(user.role));
    }
  }, [isSessionChecked, user, router]);

  if (!isSessionChecked || user) {
    return null;
  }

  return (
    <PageContainer>
      <div className="mx-auto grid grid-cols-1 min-h-[calc(100dvh-5.5rem)] max-w-6xl animate-fade-in lg:min-h-[calc(100dvh-6.5rem)] lg:grid-cols-[minmax(0,5fr)_minmax(420px,7fr)] lg:items-stretch lg:gap-6">
        <section
          className="flex min-h-[calc(100dvh-5.5rem)] items-center justify-center lg:max-h-[calc(100dvh-6.5rem)] lg:min-h-0 lg:overflow-y-auto lg:p-2"
          aria-label="Authentication form"
        >
          {children}
        </section>
        <section
          className="relative hidden min-h-0 lg:order-first flex-col justify-between gap-8 overflow-hidden rounded-panel bg-[linear-gradient(150deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_55%,black))] p-8 text-white shadow-soft lg:flex lg:max-h-[calc(100dvh-6.5rem)]"
          aria-labelledby="auth-hero-title"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-20 size-80 rounded-full bg-secondary/20 blur-3xl" />
          <ChessKnight
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-6 -right-10 size-80 text-white/10"
            strokeWidth={1.25}
          />

          <div className="relative z-10 grid justify-items-center gap-6 text-center">
            <div className="flex justify-center [@media(max-height:700px)]:hidden">
              <Logo onDark size={96} />
            </div>
            <div className="hidden justify-center [@media(max-height:700px)]:flex">
              <Logo onDark size={64} />
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <Crown aria-hidden="true" className="size-4 text-secondary" strokeWidth={2.5} />
              Live chess coaching academy
            </span>
            <div className="grid gap-3">
              <p className="font-display text-4xl font-extrabold leading-tight tracking-tight" id="auth-hero-title">
                Master the board with expert coaches.
              </p>
              <p className="mx-auto max-w-md text-base leading-relaxed text-white/80">
                Premium chess learning for focused students, ambitious juniors and supportive families.
              </p>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/20 pt-6 [@media(max-height:700px)]:pt-4">
            <HeroFeatureCarousel />
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
