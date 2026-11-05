"use client";

import { LogIn, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTenantBrand } from "../context/TenantBrandProvider";

/**
 * The home page on another academy's own address (docs/SAAS_MULTI_TENANCY.md
 * §F): its name, tagline, sign-in and contact, with no NexaChess marketing.
 * Rendered on every host and hidden before first paint where it doesn't apply.
 */
export function AcademyHome() {
  const { config, name } = useTenantBrand();
  const unknown = config !== null && config.tenantId === null;

  return (
    <div className="academy-brand-only min-h-dvh bg-app-background text-app-text">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-app-border bg-app-surface px-4 sm:px-8">
        <Logo size={36} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!unknown ? (
            <Button asChild size="sm">
              <Link href="/login">
                <LogIn aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Sign in
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-16 text-center sm:py-24">
        {unknown ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">No academy here</h1>
            <p className="text-app-muted">This address isn&apos;t connected to an academy. Check the link you were given.</p>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{name || " "}</h1>
            {config?.tagline ? <p className="text-lg text-app-muted">{config.tagline}</p> : null}
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/register">Join as a student</Link>
              </Button>
            </div>
            {config?.contactEmail || config?.contactPhone ? (
              <section className="mx-auto mt-6 grid gap-2 rounded-panel border border-app-border bg-app-surface p-5 text-sm shadow-card">
                <h2 className="font-semibold">Contact</h2>
                {config.contactEmail ? (
                  <a className="inline-flex items-center justify-center gap-2 text-primary-ink" href={`mailto:${config.contactEmail}`}>
                    <Mail aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    {config.contactEmail}
                  </a>
                ) : null}
                {config.contactPhone ? (
                  <a className="inline-flex items-center justify-center gap-2 text-primary-ink" href={`tel:${config.contactPhone}`}>
                    <Phone aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    {config.contactPhone}
                  </a>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </main>

      {config?.poweredBy ? (
        <footer className="pb-8 text-center text-xs text-app-muted">Powered by NexaChess</footer>
      ) : null}
    </div>
  );
}
