"use client";

import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { ChessAppearanceProvider } from "@/features/chess-appearance/context/ChessAppearanceProvider";
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
  const isMeetingRoute = pathname?.startsWith("/live-class") || pathname?.startsWith("/demo");
  // The academy marketing page has its own nav/footer chrome — never the
  // dashboard shell.
  const isChromeless = isMeetingRoute || pathname?.startsWith("/academy");

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
            <ChessAppearanceProvider>
              <SessionBootstrap />
              <TypographySync />
              <AcquisitionCapture />
              {!isChromeless && <Header />}
              {/* <EmailVerificationBanner /> (Temporarily disabled) */}
              <div className={!isChromeless ? "pt-16" : ""}>{children}</div>
            </ChessAppearanceProvider>
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
