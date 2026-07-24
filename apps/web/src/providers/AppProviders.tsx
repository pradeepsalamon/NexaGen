"use client";

import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { TooltipProvider } from "@/components/ui/Tooltip";

import { SessionBootstrap } from "./SessionBootstrap";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMeetingRoute = pathname?.startsWith("/live-class") || pathname?.startsWith("/test-board");

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
            <SessionBootstrap />
            {!isMeetingRoute && <Header />}
            {/* <EmailVerificationBanner /> (Temporarily disabled) */}
            <div className={!isMeetingRoute ? "pt-16" : ""}>{children}</div>
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
