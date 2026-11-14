"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import "../styles/globals.css";

// Replaces the root layout when it crashes, so it renders its own <html>.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-app-background text-app-text">
        <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
          <div className="mx-auto flex max-w-[420px] flex-col items-center space-y-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-muted">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
              <p className="text-app-muted">
                The error has been reported. Try again, or reload the page.
              </p>
            </div>
            <Button className="gap-2" onClick={reset}>
              <RotateCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
