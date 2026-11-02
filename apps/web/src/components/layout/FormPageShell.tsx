import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * Shared layout for full-page create/edit screens: a sticky header with a back
 * link, title and the page's actions (Preview / Save draft / Publish …), then
 * the form body — two columns when an `aside` is given.
 */
export function FormPageShell({
  actions,
  aside,
  backHref,
  backLabel = "Back",
  children,
  description,
  eyebrow,
  title
}: {
  actions?: ReactNode;
  /** Right-hand column on large screens (status, metadata, help). */
  aside?: ReactNode;
  backHref: string;
  backLabel?: string;
  children: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="sticky top-16 z-20 -mx-4 flex flex-col gap-3 border-b border-app-border bg-app-background/95 px-4 py-3 supports-[backdrop-filter]:bg-app-background/85 supports-[backdrop-filter]:backdrop-blur sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SimpleTooltip label={backLabel}>
            <Button asChild size="icon" variant="neutral">
              <Link aria-label={backLabel} href={backHref}>
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          </SimpleTooltip>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-bold text-primary-ink">{eyebrow}</p>
            ) : null}
            <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight text-app-text">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-app-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
      </header>

      <div className={cn(aside && "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start")}>
        <div className="min-w-0 space-y-6">{children}</div>
        {aside ? <aside className="space-y-4 lg:sticky lg:top-40">{aside}</aside> : null}
      </div>
    </div>
  );
}
