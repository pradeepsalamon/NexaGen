import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { HeroChessArt } from "@/components/illustrations/HeroChessArt";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export type HeroStat = {
  href?: string;
  icon: LucideIcon;
  label: string;
  /** `undefined` while loading draws a placeholder; never pass a made-up number. */
  value: ReactNode | undefined;
};

type HeroBannerProps = {
  /** Right-aligned controls (they read the dark palette: `surface-brand`). */
  actions?: ReactNode;
  /** Replaces the default chess artwork; `null` for none. */
  art?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  /** Small line above the title ("Coach dashboard"). */
  eyebrow?: ReactNode;
  /** Real figures only, two per row on phones. */
  stats?: HeroStat[];
  title: ReactNode;
};

/**
 * The navy welcome banner at the top of a dashboard: the page's `h1`, a line of
 * context, real headline figures and the chess artwork. One per page, in place
 * of `PageHeader`. Always navy (`surface-brand`), so it reads the same in both
 * themes; the artwork hides below `sm` so a phone keeps the figures.
 */
export function HeroBanner({ actions, art, children, description, eyebrow, stats, title }: HeroBannerProps) {
  const artwork = art === undefined ? <HeroChessArt /> : art;

  return (
    <section className="surface-brand bg-hero-brand relative mb-6 overflow-hidden rounded-panel text-app-text shadow-card animate-fade-in">
      {/* Chess pattern on the right half, faded out before it reaches the text. */}
      <div
        aria-hidden="true"
        className="pattern-chess pattern-fade-r pointer-events-none absolute inset-y-0 right-0 w-2/3 [--pattern-alpha:0.07] [--pattern-rgb:var(--rgb-on-brand)] [--pattern-size:36px]"
      />
      <div className="relative grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-7">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold text-accent-ink">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-app-text sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="mt-1.5 max-w-xl text-sm text-app-muted sm:text-base">{description}</p> : null}
          {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
          {stats?.length ? (
            <ul className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 sm:gap-3">
              {stats.map((stat) => (
                <li key={stat.label}>
                  <HeroStatChip stat={stat} />
                </li>
              ))}
            </ul>
          ) : null}
          {children}
        </div>
        {artwork ? (
          <div aria-hidden="true" className="-mb-7 hidden w-44 self-end sm:block md:w-56 lg:w-80">
            {artwork}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HeroStatChip({ stat }: { stat: HeroStat }) {
  const Icon = stat.icon;
  const body = (
    <span
      className={cn(
        "flex h-full items-center gap-2.5 rounded-app border border-on-brand/10 bg-on-brand/[0.06] p-2.5 sm:p-3",
        stat.href && "transition-colors hover:border-on-brand/25 hover:bg-on-brand/10"
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary sm:size-9"
      >
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        {stat.value === undefined ? (
          <Skeleton className="h-6 w-10" />
        ) : (
          <span className="block font-display text-lg font-bold leading-6 tabular-nums text-app-text sm:text-xl">
            {stat.value}
          </span>
        )}
        <span className="block text-xs leading-4 text-app-muted">{stat.label}</span>
      </span>
    </span>
  );

  return stat.href ? (
    <Link
      className="block h-full rounded-app font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      href={stat.href}
    >
      {body}
    </Link>
  ) : (
    body
  );
}
