"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import { enterSupportSession } from "../api/platformApi";

/**
 * `/support/enter?token=…`: the one-time link from the platform console. It
 * signs this browser in on the academy's own address as its support account
 * (docs/SAAS_MULTI_TENANCY.md §I "Support access"), then opens the admin area.
 */
export function SupportEnterClient({ token }: { token: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const [failed, setFailed] = useState(!token);
  // The link works once: never post it twice (e.g. a development double effect).
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    enterSupportSession({ token })
      .then((response) => {
        queryClient.removeQueries();
        queryClient.setQueryData(queryKeys.auth.session, response);
        setUser(response.user);
        router.replace("/admin");
      })
      .catch(() => setFailed(true));
  }, [queryClient, router, setUser, token]);

  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-lg content-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-extrabold text-app-text">Support visit</h1>
      {failed ? (
        <>
          <Alert title="This link can't be used" variant="error">
            A support link works once, for five minutes, and only on the academy&apos;s own address. Start a new visit
            from the platform console.
          </Alert>
          <Button onClick={() => router.replace("/login")} type="button" variant="neutral">
            Go to sign in
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-app-muted">Signing you in as the academy&apos;s support account…</p>
          <Skeleton className="h-2 w-full" />
        </>
      )}
    </main>
  );
}
