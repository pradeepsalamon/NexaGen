"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { useRouter } from "@/lib/navigation";
import { getRoleDashboardHref } from "@/lib/routeAccess";
import { useAuthStore } from "@/stores/authStore";

/** The app's 404. Same layout as the nginx outage page (deploy/status-pages/page.html). */
export default function NotFound() {
  const router = useRouter();
  const brandName = useBrandName();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const role = useAuthStore((state) => state.user?.role);
  // Logged-out until the saved session loads, so the server render matches the first client one.
  const signedIn = isHydrated && Boolean(role);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-app-background px-4 py-12 text-center text-app-text">
      <div className="mx-auto flex w-full max-w-[36rem] flex-col items-center">
        <p className="font-display text-xl font-bold tracking-tight text-emphasis">{brandName}</p>

        <p aria-hidden="true" className="mt-8 font-display text-[6rem] font-extrabold leading-none tracking-tight text-emphasis tabular-nums sm:text-[8rem]">
          404
        </p>
        <span aria-hidden="true" className="mt-8 h-1.5 w-20 rounded-full bg-accent" />

        <h1 className="mt-8 font-display text-2xl font-bold tracking-tight text-emphasis sm:text-3xl">We can&rsquo;t find that page</h1>
        <p className="mt-3 text-base text-app-muted sm:text-lg">
          The link may be out of date, or the page may have moved. Let&rsquo;s get you back on track.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {signedIn ? (
            <>
              <Button asChild className="sm:min-w-[12rem]" size="lg">
                <Link href={getRoleDashboardHref(role)}>
                  <LayoutDashboard aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  Back to dashboard
                </Link>
              </Button>
              <Button className="sm:min-w-[12rem]" onClick={() => router.back()} size="lg" variant="secondary">
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Go back
              </Button>
            </>
          ) : (
            <>
              <Button asChild className="sm:min-w-[12rem]" size="lg">
                <Link href="/login">
                  <LogIn aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  Log in
                </Link>
              </Button>
              <Button asChild className="sm:min-w-[12rem]" size="lg" variant="secondary">
                <Link href="/">Go to {brandName}</Link>
              </Button>
            </>
          )}
        </div>

        <p className="mt-8 text-sm text-app-muted">Still stuck? Ask your coach or academy for the right link.</p>
      </div>
    </main>
  );
}
