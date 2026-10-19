"use client";

import * as Sentry from "@sentry/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getCurrentUser } from "../features/auth/api/authApi";
import { ApiError } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { canAccessPath, getRoleDashboardHref, isPublicPath } from "../lib/routeAccess";
import { useAuthStore } from "../stores/authStore";

// Only a 401/403 means "no session"; a network blip or 5xx must not sign the user out.
function isAuthRejection(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

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
  // on public pages, unless we already hold a persisted user (AUDIT L5). Everywhere
  // else we still probe, so a valid cookie with a cleared store is recovered.
  const onPublicPath = pathname != null && isPublicPath(pathname);
  const sessionEnabled = isHydrated && (hasUser || !onPublicPath);

  const sessionQuery = useQuery({
    enabled: sessionEnabled,
    queryFn: getCurrentUser,
    queryKey: queryKeys.auth.session,
    retry: (failureCount, error) => !isAuthRejection(error) && failureCount < 2
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

  // Query keys aren't scoped by user, and staleTime is a minute: after a
  // logout, or another account signing in on the same tab, the previous
  // user's dashboard, messages or progress would render from cache. Drop
  // everything the moment the signed-in user changes away from someone.
  const queryClient = useQueryClient();
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) {
      queryClient.removeQueries();
    }
    previousUserId.current = userId;
  }, [queryClient, userId]);

  useEffect(() => {
    if (sessionQuery.data) {
      setUser(sessionQuery.data.user);
    }
  }, [sessionQuery.data, setUser]);

  // Client half of the route RBAC in middleware.ts: catches refresh-only sessions
  // (no role in a cookie) and client-side navigations.
  const verifiedRole = sessionQuery.data?.user.role;
  useEffect(() => {
    if (verifiedRole && pathname && !canAccessPath(pathname, verifiedRole)) {
      router.replace(getRoleDashboardHref(verifiedRole));
    }
  }, [pathname, router, verifiedRole]);

  useEffect(() => {
    if (sessionQuery.isError && isAuthRejection(sessionQuery.error)) {
      clearSession();
    }
  }, [clearSession, sessionQuery.error, sessionQuery.isError]);

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
