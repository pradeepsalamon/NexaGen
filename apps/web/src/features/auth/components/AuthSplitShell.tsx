"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  Crown,
  Globe,
  GraduationCap,
  type LucideIcon,
  Puzzle,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

// Navy-toned artwork, so the one image suits the navy panel in both themes.
const AUTH_ARTWORK = "/auth/auth_dark.webp";

export type AuthShellVariant =
  | "login"
  | "student-register"
  | "coach-register"
  | "forgot-password";

type Point = { Icon: LucideIcon; title: string; description?: string };

const SIGN_IN_COPY = {
  points: [
    {
      Icon: TrendingUp,
      title: "Progress you can see",
      description: "Track your improvement with personalized guidance."
    },
    {
      Icon: Puzzle,
      title: "Practice between classes",
      description: "Solve puzzles, play games and sharpen your skills."
    }
  ] satisfies Point[],
  subtitle:
    "Premium chess learning for focused students, ambitious juniors and supportive families.",
  title: "Master the board with expert coaches."
};

const COPY: Record<AuthShellVariant, { points: Point[]; subtitle: string; title: string }> = {
  "coach-register": {
    points: [
      { Icon: Globe, title: "Teach globally online" },
      { Icon: CalendarClock, title: "Flexible schedule" },
      { Icon: Sparkles, title: "Make an impact" }
    ],
    subtitle:
      "Join as a coach and help shape the next generation of chess players worldwide.",
    title: "Share your knowledge."
  },
  "forgot-password": SIGN_IN_COPY,
  login: SIGN_IN_COPY,
  "student-register": {
    points: [
      { Icon: GraduationCap, title: "Learn from expert coaches" },
      { Icon: BarChart3, title: "Track your progress" },
      { Icon: Users, title: "Join a global community" }
    ],
    subtitle:
      "Start your journey with expert coaching, personalized learning and a global chess community.",
    title: "Join Nexa Chess today."
  }
};

interface AuthSplitShellProps {
  variant: AuthShellVariant;
  children: ReactNode;
  /** A wider card for the two-column registration form. */
  wide?: boolean;
}

/**
 * Auth pattern: a solid navy brand panel (text never sits on the artwork) beside
 * the form card. The card holds the page's only `h1`; the panel tagline is a `<p>`.
 * Below `lg` the panel shrinks to a navy bar with the logo and theme toggle, and the card is
 * centred in the space under it (a card taller than the screen starts at the top and scrolls).
 */
export function AuthSplitShell({ variant, children, wide = false }: AuthSplitShellProps) {
  const brandName = useBrandName();
  const base = COPY[variant];
  // Copy names the academy on its own address (§F).
  const copy = { ...base, title: base.title.replace("Nexa Chess", brandName) };

  return (
    <div className="flex min-h-dvh flex-col bg-app-background text-app-text lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="surface-brand relative flex shrink-0 flex-col overflow-hidden border-b border-app-border bg-app-background text-app-text lg:sticky lg:top-0 lg:h-dvh lg:border-b-0">
        <div className="relative z-10 flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:h-auto lg:px-10 lg:pt-8 xl:px-14">
          <Link
            aria-label={`${brandName} home`}
            className="rounded-control transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            href="/"
          >
            <Logo onDark size={36} />
          </Link>
          <ThemeToggle />
        </div>

        <div className="relative z-10 hidden max-w-lg px-10 pt-10 lg:block xl:px-14">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-accent-ink">
            <Crown aria-hidden="true" className="size-4" strokeWidth={2.25} />
            Live chess coaching academy
          </p>
          <p className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-app-text xl:text-4xl">
            {copy.title}
          </p>
          <p className="mt-3 text-base text-app-muted">{copy.subtitle}</p>
          <ul className="mt-8 grid gap-4">
            {copy.points.map(({ Icon, title, description }) => (
              <li className="flex items-start gap-3" key={title}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-app-soft text-accent-ink">
                  <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                </span>
                <span className="grid gap-0.5 pt-1.5">
                  <span className="text-sm font-semibold text-app-text">{title}</span>
                  {description ? (
                    <span className="text-sm text-app-muted">{description}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Decorative: below the text, never behind it. Not fetched below lg (display:none + lazy). */}
        <div
          aria-hidden="true"
          className="relative mt-auto hidden aspect-[16/9] w-full shrink-0 lg:block"
        >
          <Image
            alt=""
            className="object-cover object-left-bottom"
            fill
            sizes="(min-width: 1024px) 42vw, 1px"
            src={AUTH_ARTWORK}
          />
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-brand-900 to-transparent" />
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
        <div
          className={cn(
            "w-full rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:p-8",
            wide ? "max-w-2xl" : "max-w-md"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
