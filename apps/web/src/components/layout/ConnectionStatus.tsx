"use client";

import { CheckCircle2, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { isChunkLoadError } from "@/lib/chunkErrors";
import { cn } from "@/lib/utils";

const BACK_ONLINE_MS = 3000;

/**
 * One small pill for two browser-side conditions (docs/SERVICE_STATUS.md § "In the app"):
 * the device is offline, or a background chunk load failed because a new version was deployed.
 * Crashes during render are the error.tsx screens; the server being down is the nginx page.
 */
export function ConnectionStatus() {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [backOnline, setBackOnline] = useState(false);
  const [newVersion, setNewVersion] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    setOnline(navigator.onLine);

    const goOffline = () => {
      clearTimeout(timer);
      setBackOnline(false);
      setOnline(false);
    };
    const goOnline = () => {
      setOnline(true);
      setBackOnline(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    };
    // A lazy import that runs outside render (a click handler, a dialog) never reaches error.tsx.
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) setNewVersion(true);
    };
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error ?? event.message)) setNewVersion(true);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  // The classroom's controls sit along the bottom edge.
  const inRoom = pathname?.startsWith("/live-class") || pathname?.startsWith("/demo");

  let content: ReactNode = null;
  if (!online) {
    content = (
      <>
        <WifiOff aria-hidden="true" className="size-4 shrink-0 text-warning-ink" strokeWidth={2.5} />
        <span>You&apos;re offline. We&apos;ll reconnect when your internet is back.</span>
      </>
    );
  } else if (newVersion) {
    content = (
      <>
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
        <span>A new version is available.</span>
        <Button onClick={() => window.location.reload()} size="sm" variant="ghost">
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Reload
        </Button>
      </>
    );
  } else if (backOnline) {
    content = (
      <>
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success-ink" strokeWidth={2.5} />
        <span>Back online.</span>
      </>
    );
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4",
        inRoom ? "top-3" : "bottom-4"
      )}
      role="status"
    >
      {content && (
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-app-border bg-app-surface py-1.5 pl-4 pr-4 text-sm text-app-text shadow-card has-[button]:pr-1.5">
          {content}
        </div>
      )}
    </div>
  );
}
