"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard, User } from "lucide-react";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";

export function HeroActions() {
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = isSessionChecked && Boolean(user);

  if (isAuthenticated && user) {
    const dashboardHref = getRoleDashboardHref(user.role);

    return (
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-5 text-sm font-extrabold text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-primary)_26%,transparent)] transition hover:-translate-y-0.5 hover:opacity-100"
          href={dashboardHref}
        >
          <LayoutDashboard aria-hidden="true" className="size-4" />
          <span>Go to Dashboard</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-app-border bg-app-surface/80 px-5 text-sm font-extrabold text-app-text shadow-card transition hover:-translate-y-0.5 hover:opacity-100"
          href="/profile"
        >
          <User aria-hidden="true" className="size-4 text-app-muted" />
          <span>My Profile</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-7 flex flex-wrap items-center gap-3">
      <Link
        className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-5 text-sm font-extrabold text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-primary)_26%,transparent)] transition hover:-translate-y-0.5 hover:opacity-100"
        href="/register"
      >
        <span>Register</span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      <Link
        className="inline-flex min-h-11 items-center rounded-control border border-app-border bg-app-surface/80 px-5 text-sm font-extrabold text-app-text shadow-card transition hover:-translate-y-0.5 hover:opacity-100"
        href="/login"
      >
        <span>Log in</span>
      </Link>
    </div>
  );
}
