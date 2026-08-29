"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "../features/auth/api/authApi";
import { queryKeys } from "../lib/queryKeys";
import { useAuthStore } from "../stores/authStore";

export function SessionBootstrap() {
  const router = useRouter();
  const clearSession = useAuthStore((state) => state.clearSession);
  const setSessionChecked = useAuthStore((state) => state.setSessionChecked);
  const setSessionLoading = useAuthStore((state) => state.setSessionLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const sessionQuery = useQuery({
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
    setSessionLoading(sessionQuery.isLoading || sessionQuery.isFetching);
  }, [sessionQuery.isFetching, sessionQuery.isLoading, setSessionLoading]);

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
    if (sessionQuery.isError || sessionQuery.isSuccess) {
      setSessionChecked(true);
      setSessionLoading(false);
    }
  }, [
    sessionQuery.isError,
    sessionQuery.isSuccess,
    setSessionChecked,
    setSessionLoading
  ]);

  return null;
}
