"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getCurrentUser } from "../features/auth/api/authApi";
import { useAuthStore } from "../stores/authStore";

export function SessionBootstrap() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const setUser = useAuthStore((state) => state.setUser);
  const sessionQuery = useQuery({
    queryFn: getCurrentUser,
    queryKey: ["auth", "me"],
    retry: false
  });

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

  return null;
}
