"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectionStatus } from "@/components/layout/ConnectionStatus";
import { EmailVerificationBanner } from "@/components/layout/EmailVerificationBanner";
import { Header } from "@/components/layout/Header";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { PageScrollbar } from "@/components/layout/PageScrollbar";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { TenantBrandProvider } from "@/features/branding/context/TenantBrandProvider";
import { ChessAppearanceProvider } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { PresenceBridge } from "@/features/presence/components/PresenceBridge";
import { TypographySync } from "@/features/typography/context/TypographySync";
import { isFinalClientError } from "@/lib/api";
import { reportErrorToast } from "@/lib/errorToast";

import { AcquisitionCapture } from "./AcquisitionCapture";
import { SessionBootstrap } from "./SessionBootstrap";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

// Starts remembering where each press lands, so a dialog opened from a lazily loaded
// chunk still grows out of the control that opened it (lib/motion/launchOrigin.ts).
import "@/lib/motion/launchOrigin";
// Focus rings only for keyboard use on buttons, tabs and menu items (lib/inputModality.ts).
import "@/lib/inputModality";

// The full chessboard visual system (board themes + piece sets), imported
// exactly once here instead of once per board component.
import "@/features/chess-appearance/styles/index.css";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMeetingRoute =
    pathname?.startsWith("/live-class") || pathname?.startsWith("/demo");
  // The marketing home page and the auth pages bring their own full-page
  // chrome (AcademyNavbar / AuthSplitShell) — never the dashboard shell.
  const isAuthRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname?.startsWith("/verify-email") ||
    pathname?.startsWith("/unsubscribe");

  // A referral link (/r/<code>) is a brief hand-off to the home page.
  const isReferralLink = pathname?.startsWith("/r/");
  // `/` is the Design System v2 academy page; `/academy` keeps the original one (swapped 2026-11-16).
  const isChromeless =
    isMeetingRoute || isAuthRoute || isReferralLink || pathname === "/" || pathname === "/academy";

  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Every failed load and action raises a toast (docs/UI_RULES.md § "Errors").
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => reportErrorToast(error, "action", mutation.meta)
        }),
        queryCache: new QueryCache({
          onError: (error, query) => reportErrorToast(error, "load", query.meta)
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // A 404 or 403 won't change on a second ask: show it straight away.
            retry: (failureCount, error) => failureCount < 1 && !isFinalClientError(error),
            staleTime: 60_000
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <TooltipProvider delayDuration={600}>
            <TenantBrandProvider>
            <ChessAppearanceProvider>
              <SessionBootstrap />
              <PresenceBridge />
              <TypographySync />
              <AcquisitionCapture />
              <NavigationProgress />
              <ConnectionStatus />
              {!isChromeless && <Header />}
              {/* Signed in: the page's thumb-only scrollbar, below whichever header the page has
                  (the app's, or the home page's own); none on auth and live-class pages. */}
              <PageScrollbar headerRem={isMeetingRoute || isAuthRoute || isReferralLink ? 0 : 4} />
              <div className={!isChromeless ? "pt-16" : ""}>
                {!isChromeless && <EmailVerificationBanner />}
                {children}
              </div>
            </ChessAppearanceProvider>
            </TenantBrandProvider>
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
