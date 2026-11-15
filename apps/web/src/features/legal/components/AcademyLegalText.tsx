"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_PAGE_LABELS, LEGAL_PAGE_PATHS, type LegalPageKind } from "@nexa-chess/types";
import { FormattedText } from "@/components/ui/FormattedText";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTenantBrand } from "@/features/branding/context/TenantBrandProvider";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { usePublicLegalPage } from "../hooks/useLegalPages";

const LINK = "font-medium text-primary-ink hover:underline";

/**
 * `/privacy` and `/terms` on an academy's own address: its own wording when it
 * has written one, else the built-in page (`children`, server-rendered).
 *
 * Nexa's hosts fetch nothing and show `children` as before. On an academy's
 * address the built-in page is hidden before first paint (`platform-brand-only`)
 * so it never flashes ahead of the academy's own text, and is shown again only
 * once we know the academy has none.
 */
export function AcademyLegalText({ children, kind }: { children: ReactNode; kind: LegalPageKind }) {
  const { config, isAcademyHost } = useTenantBrand();
  const query = usePublicLegalPage(kind, isAcademyHost);
  const timeZone = useUserTimeZone();
  const page = isAcademyHost ? query.data : undefined;
  const other: LegalPageKind = kind === "privacy" ? "terms" : "privacy";

  if (page?.body) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text sm:text-3xl">
          {LEGAL_PAGE_LABELS[kind]}
        </h1>
        {config?.name ? <p className="mt-2 text-base text-app-muted">{config.name}</p> : null}
        {page.updatedAt ? (
          <p className="mt-1 text-sm text-app-muted">Last updated {formatFullDate(page.updatedAt, timeZone)}</p>
        ) : null}

        <FormattedText className="mt-8 space-y-3 leading-7 text-app-text" source={page.body} />

        <footer className="mt-12 border-t border-app-border pt-6 text-sm text-app-muted">
          {config?.contactEmail ? (
            <p>
              Questions? Email{" "}
              <a className={LINK} href={`mailto:${config.contactEmail}`}>
                {config.contactEmail}
              </a>
              .
            </p>
          ) : null}
          <p className="mt-2">
            See also the{" "}
            <Link className={LINK} href={LEGAL_PAGE_PATHS[other]}>
              {LEGAL_PAGE_LABELS[other]}
            </Link>
            .
          </p>
        </footer>
      </main>
    );
  }

  // Known to have no wording of its own (or the lookup failed): the built-in page.
  const useBuiltIn = isAcademyHost && (query.isSuccess || query.isError);
  return (
    <>
      {useBuiltIn ? null : (
        <div className="academy-brand-only mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      )}
      <div className={useBuiltIn ? undefined : "platform-brand-only"}>{children}</div>
    </>
  );
}
