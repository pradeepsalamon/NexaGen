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
          <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-app-danger-soft text-app-danger-ink">
              <AlertTriangle aria-hidden="true" className="size-7" strokeWidth={2.25} />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Something went wrong</h1>
              <p className="text-app-muted">
                The error has been reported. Try again, or reload the page.
              </p>
            </div>
            <Button onClick={reset}>
              <RotateCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
