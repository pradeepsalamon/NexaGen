"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, ArrowLeft, RefreshCw, RotateCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/chunkErrors";
import { getRoleDashboardHref } from "@/lib/routeAccess";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

export type ErrorScreenProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * `section`: inside a role area, under its nav. `page`: the root segment.
   * `fullscreen`: global-error, which replaces the root layout.
   * `classroom`: a live class or demo room, where a full reload rejoins cleanly.
   */
  variant?: "section" | "page" | "fullscreen" | "classroom";
};

/** What every `error.tsx` renders. docs/SERVICE_STATUS.md § "In the app". */
export function ErrorScreen({ error, reset, variant = "page" }: ErrorScreenProps) {
  const role = useAuthStore((state) => state.user?.role);
  const newVersion = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (newVersion) {
      // Expected after every deploy, not a bug: reload once instead of reporting.
      if (reloadForNewVersion()) setReloading(true);
      return;
    }
    Sentry.captureException(error);
  }, [error, newVersion]);

  const reload = () => {
    setReloading(true);
    window.location.reload();
  };

  const homeHref = getRoleDashboardHref(role);

  if (newVersion) {
    return (
      <Frame variant={variant}>
        <Icon tone="primary">
          <Sparkles aria-hidden="true" className="size-7" strokeWidth={2.25} />
        </Icon>
        <Copy title="A new version is available">
          The app was just updated. Reload to continue. Anything you already saved is safe.
        </Copy>
        <Button isLoading={reloading} onClick={reload}>
          {!reloading && <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />}
          Reload
        </Button>
      </Frame>
    );
  }

  if (variant === "classroom") {
    return (
      <Frame variant={variant}>
        <Icon tone="danger">
          <AlertTriangle aria-hidden="true" className="size-7" strokeWidth={2.25} />
        </Icon>
        <Copy digest={error.digest} title="The classroom hit a problem">
          The error has been reported. Rejoin to reconnect your video and board.
        </Copy>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button asChild variant="neutral">
            <Link href={homeHref}>
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Leave
            </Link>
          </Button>
          <Button isLoading={reloading} onClick={reload}>
            {!reloading && <RotateCw aria-hidden="true" className="size-4" strokeWidth={2.5} />}
            Rejoin class
          </Button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame variant={variant}>
      <Icon tone="danger">
        <AlertTriangle aria-hidden="true" className="size-7" strokeWidth={2.25} />
      </Icon>
      <Copy digest={error.digest} title="Something went wrong">
        {variant === "section"
          ? "This page hit an error and it has been reported. The rest of the app still works."
          : "The error has been reported. Try again, or reload the page."}
      </Copy>
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        {variant === "fullscreen" ? (
          <Button onClick={reload} variant="neutral">
            Reload page
          </Button>
        ) : (
          <Button asChild variant="neutral">
            <Link href={homeHref}>
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {homeHref === "/" ? "Go home" : "Back to dashboard"}
            </Link>
          </Button>
        )}
        <Button onClick={reset}>
          <RotateCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Try again
        </Button>
      </div>
    </Frame>
  );
}

function Frame({ children, variant }: { children: ReactNode; variant: NonNullable<ErrorScreenProps["variant"]> }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-app-background p-8 text-center text-app-text",
        variant === "section" && "min-h-[60vh] rounded-panel",
        variant === "page" && "min-h-[calc(100dvh-4rem)]",
        (variant === "fullscreen" || variant === "classroom") && "min-h-dvh"
      )}
      role="alert"
    >
      <div className="mx-auto flex max-w-[440px] flex-col items-center gap-4">{children}</div>
    </div>
  );
}

function Icon({ children, tone }: { children: ReactNode; tone: "danger" | "primary" }) {
  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-full",
        tone === "danger" ? "bg-app-danger-soft text-app-danger-ink" : "bg-primary-soft text-primary-ink"
      )}
    >
      {children}
    </div>
  );
}

function Copy({ children, digest, title }: { children: ReactNode; digest?: string; title: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="text-app-muted">{children}</p>
      {digest && <p className="pt-1 font-mono text-xs text-app-subtle">Reference: {digest}</p>}
    </div>
  );
}
