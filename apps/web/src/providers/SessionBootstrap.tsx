"use client";

import * as Sentry from "@sentry/nextjs";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "../features/auth/api/authApi";
import { queryKeys } from "../lib/queryKeys";
import { useAuthStore } from "../stores/authStore";

// The only surfaces an anonymous visitor routinely lands on. Everywhere else we
// still probe the session so a returning user with a valid cookie but no
// persisted store (e.g. cleared localStorage) is recovered.
const PUBLIC_PATHS = new Set(["/", "/academy", "/forgot-password", "/login", "/register", "/signup"]);

export function SessionBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const clearSession = useAuthStore((state) => state.clearSession);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const hasUser = useAuthStore((state) => Boolean(state.user));
  const setSessionChecked = useAuthStore((state) => state.setSessionChecked);
  const setSessionLoading = useAuthStore((state) => state.setSessionLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const userId = useAuthStore((state) => state.user?.id);

  // Skip the /auth/me call (and its 401 → refresh → 401) for anonymous visitors
  // on public pages, unless we already hold a persisted user (AUDIT L5).
  const onPublicPath = pathname != null && PUBLIC_PATHS.has(pathname);
  const sessionEnabled = isHydrated && (hasUser || !onPublicPath);

  const sessionQuery = useQuery({
    enabled: sessionEnabled,
    queryFn: getCurrentUser,
    queryKey: queryKeys.auth.session,
    retry: false
  });

  useEffect(() => {
    const handleLogout = () => {
      router.push("/login");
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [router]);

  useEffect(() => {
    if (!isHydrated) return;
    setSessionLoading(
      sessionEnabled && (sessionQuery.isLoading || sessionQuery.isFetching)
    );
  }, [
    isHydrated,
    sessionEnabled,
    sessionQuery.isFetching,
    sessionQuery.isLoading,
    setSessionLoading
  ]);

  // Id only: error reports never carry names or contact details.
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);

  useEffect(() => {
    if (sessionQuery.data) {
      setUser(sessionQuery.data.user);
    }
  }, [sessionQuery.data, setUser]);

  useEffect(() => {
    if (sessionQuery.isError) {
      clearSession();
    }
  }, [clearSession, sessionQuery.isError]);

  useEffect(() => {
    // Once hydrated, resolve the "checking session" gate as soon as the query
    // settles — or immediately when it's disabled (anonymous visitor).
    if (isHydrated && (!sessionEnabled || sessionQuery.isError || sessionQuery.isSuccess)) {
      setSessionChecked(true);
      setSessionLoading(false);
    }
  }, [
    isHydrated,
    sessionEnabled,
    sessionQuery.isError,
    sessionQuery.isSuccess,
    setSessionChecked,
    setSessionLoading
  ]);

  return null;
}
