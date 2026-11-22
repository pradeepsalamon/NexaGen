"use client";

import type { ReactNode } from "react";
import { CalendarClock, Globe, GraduationCap, Sparkles, TrendingUp, Users } from "lucide-react";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { AuthFrame } from "../login-v2/AuthFrame";
import { type AuthHeroCopy, SIGN_IN_HERO } from "../login-v2/LoginHero";

export type AuthShellVariant =
  | "login"
  | "student-register"
  | "coach-register"
  | "forgot-password";

const COPY: Record<AuthShellVariant, AuthHeroCopy> = {
  "coach-register": {
    emphasis: "knowledge.",
    features: [
      { Icon: Globe, lines: ["Teach students", "worldwide"] },
      { Icon: CalendarClock, lines: ["Flexible", "schedule"] },
      { Icon: Sparkles, lines: ["Make a", "lasting impact"] }
    ],
    lead: "Share your",
    subtitle: "Join as a coach and help shape the next generation of chess players worldwide."
  },
  "forgot-password": SIGN_IN_HERO,
  login: SIGN_IN_HERO,
  "student-register": {
    emphasis: "Nexa Chess today.",
    features: [
      { Icon: GraduationCap, lines: ["Learn from", "expert coaches"] },
      { Icon: TrendingUp, lines: ["Track your", "progress"] },
      { Icon: Users, lines: ["Join a global", "community"] }
    ],
    lead: "Join",
    subtitle:
      "Start your journey with expert coaching, personalized learning and a global chess community."
  }
};

interface AuthSplitShellProps {
  variant: AuthShellVariant;
  children: ReactNode;
  /** A wider card for the two-column registration form. */
  wide?: boolean;
}

/**
 * The frame of every signed-out account page (login, register, password reset, email
 * verification, unsubscribe): `AuthFrame`'s hero beside the page's card, with the hero text
 * for `variant`. The card holds the page's only `h1` (`AuthHeader` / `AuthStatus`); the hero
 * headline is a `<p>`.
 */
export function AuthSplitShell({ variant, children, wide = false }: AuthSplitShellProps) {
  const brandName = useBrandName();
  const base = COPY[variant];
  // Copy names the academy on its own address (§F).
  const copy = { ...base, emphasis: base.emphasis.replace("Nexa Chess", brandName) };

  return (
    <AuthFrame copy={copy} wide={wide}>
      {children}
    </AuthFrame>
  );
}
