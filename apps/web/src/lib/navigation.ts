"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";

/** Fired on `window` just before a navigation started in code; `NavigationProgress` starts its bar. */
export const NAVIGATION_START_EVENT = "nexa:navigation-start";

type AppRouter = ReturnType<typeof useNextRouter>;

/**
 * Tells the progress bar a navigation to `href` is starting, unless it stays on this page (same
 * path: a query or hash change) or leaves the site. Link clicks are picked up by the bar itself.
 */
export function signalNavigationStart(href: string) {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
  window.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT));
}

/**
 * Next's `useRouter`, except `push` and `replace` also start the navigation progress bar.
 * Import it from here, never from `next/navigation` (ESLint enforces it).
 */
export function useRouter(): AppRouter {
  const router = useNextRouter();
  return useMemo<AppRouter>(
    () => ({
      ...router,
      push: (href, options) => {
        signalNavigationStart(href);
        router.push(href, options);
      },
      replace: (href, options) => {
        signalNavigationStart(href);
        router.replace(href, options);
      }
    }),
    [router]
  );
}
