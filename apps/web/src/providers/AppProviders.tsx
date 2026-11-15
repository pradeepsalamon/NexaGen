"use client";

import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { EmailVerificationBanner } from "@/components/layout/EmailVerificationBanner";
import { Header } from "@/components/layout/Header";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { TenantBrandProvider } from "@/features/branding/context/TenantBrandProvider";
import { ChessAppearanceProvider } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { PresenceBridge } from "@/features/presence/components/PresenceBridge";
import { TypographySync } from "@/features/typography/context/TypographySync";

import { AcquisitionCapture } from "./AcquisitionCapture";
import { SessionBootstrap } from "./SessionBootstrap";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

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
  // `/academy` is the Design System v2 rebuild of `/`, reviewed side by side before it replaces it.
  const isChromeless =
    isMeetingRoute || isAuthRoute || isReferralLink || pathname === "/" || pathname === "/academy";

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
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
              {!isChromeless && <Header />}
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
