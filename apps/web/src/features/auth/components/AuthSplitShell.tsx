"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    Crown,
    Sun,
    Moon,
    TrendingUp,
    GraduationCap,
    BarChart3,
    Users,
    ShieldCheck,
    CalendarClock,
    Sparkles
} from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

const AUTH_BG_LIGHT = "/auth/auth_light.webp";
const AUTH_BG_DARK = "/auth/auth_dark.webp";

export type AuthShellVariant =
    | "login"
    | "student-register"
    | "coach-register"
    | "forgot-password";

interface AuthSplitShellProps {
    variant: AuthShellVariant;
    children: ReactNode;
    cardMaxWidthClass?: string;
}

export function AuthSplitShell({
    variant,
    children,
    cardMaxWidthClass = "max-w-[440px]"
}: AuthSplitShellProps) {
    const { mode, toggleMode, isHydrated } = useTheme();
    const isDark = isHydrated && mode === "dark";

    const heroContent = {
        login: {
            title: (
                <>
                    Master the board
                    <br />
                    with expert coaches.
                </>
            ),
            subtitle:
                "Premium chess learning for focused students, ambitious juniors and supportive families."
        },
        "student-register": {
            title: (
                <>
                    Join Nexa Chess
                    <br />
                    Today
                </>
            ),
            subtitle:
                "Start your journey with expert coaching, personalized learning and a global chess community."
        },
        "coach-register": {
            title: (
                <>
                    Share Your
                    <br />
                    Knowledge
                </>
            ),
            subtitle:
                "Join as a coach and help shape the next generation of chess players worldwide."
        },
        "forgot-password": {
            title: (
                <>
                    Master the board
                    <br />
                    with expert coaches.
                </>
            ),
            subtitle:
                "Premium chess learning for focused students, ambitious juniors and supportive families."
        }
    }[variant];

    const featureBullets =
        variant === "coach-register"
            ? [
                { Icon: ShieldCheck, label: "Teach Globally\nOnline" },
                { Icon: CalendarClock, label: "Flexible Schedule" },
                { Icon: Sparkles, label: "Make an Impact" }
            ]
            : [
                { Icon: GraduationCap, label: "Learn from\nExpert Coaches" },
                { Icon: BarChart3, label: "Track Your\nProgress" },
                { Icon: Users, label: "Join a Global\nCommunity" }
            ];

    return (
        <div
            className="relative min-h-[100dvh] w-full overflow-x-hidden flex flex-col select-none transition-colors duration-300 bg-nx-backdrop text-nx-ink"
        >
            {/* ================= FULL-BLEED BACKGROUND ARTWORK ================= */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-nx-backdrop"
                />

                {/* Light Mode Image */}
                <div
                    className="absolute inset-0 dark:hidden"
                >
                    <Image
                        src={AUTH_BG_LIGHT}
                        alt="Nexa Chess Golden Knight Light Background"
                        fill
                        priority
                        sizes="100vw"
                        className="object-cover object-[12%_bottom] lg:object-[left_bottom]"
                    />
                    <div className="absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-nx-snow-blue via-nx-snow-blue/65 to-transparent" />
                </div>

                {/* Dark Mode Image */}
                <div
                    className="absolute inset-0 hidden dark:block"
                >
                    <Image
                        src={AUTH_BG_DARK}
                        alt="Nexa Chess Golden Knight Dark Background"
                        fill
                        // Lazy + display:none in light mode = never fetched there;
                        // only the light variant is preloaded.
                        fetchPriority="high"
                        sizes="100vw"
                        className="object-cover object-[12%_bottom] lg:object-[left_bottom]"
                    />
                    <div className="absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-nx-navy-deep via-nx-navy-deep/65 to-transparent" />
                </div>
            </div>

            {/* ================= TOP HEADER (LOGO + THEME TOGGLE) ================= */}
            <header className="relative z-20 w-full max-w-[1160px] mx-auto px-4 sm:px-6 pt-3 sm:pt-4 flex items-center justify-between shrink-0">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
                    aria-label="Back to Nexa Chess Home"
                >
                    <Image
                        src="/academy/nexa_logo_light1.png"
                        alt="NEXA Chess"
                        width={160}
                        height={44}
                        priority
                        className="h-8 sm:h-9 w-auto object-contain dark:hidden"
                    />
                    <Image
                        src="/academy/nexa_logo_dark1.png"
                        alt="NEXA Chess"
                        width={160}
                        height={44}
                        className="hidden h-8 sm:h-9 w-auto object-contain dark:block"
                    />
                </Link>

                {/* Segmented Sun / Moon Pill Toggle */}
                <button
                    onClick={toggleMode}
                    type="button"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    className="inline-flex items-center gap-1 p-1 rounded-full backdrop-blur-md border shadow-xs transition-all duration-200 cursor-pointer bg-nx-glass border-nx-field-line"
                >
                    <span
                        className="size-6 rounded-full flex items-center justify-center transition-all bg-nx-toggle-sun text-nx-toggle-sun-ink hover:text-nx-toggle-sun-hover"
                    >
                        <Sun className="size-3.5" strokeWidth={2.2} />
                    </span>
                    <span
                        className="size-6 rounded-full flex items-center justify-center transition-all bg-nx-toggle-moon text-nx-toggle-moon-ink hover:text-nx-toggle-moon-hover"
                    >
                        <Moon className="size-3.5" strokeWidth={2.2} />
                    </span>
                </button>
            </header>

            {/* Mobile Knight Spacer */}
            <div
                className="relative z-10 h-20 sm:h-24 lg:hidden pointer-events-none"
                aria-hidden="true"
            />

            {/* ================= MAIN CONTENT GRID (TIGHTER & BALANCED) ================= */}
            <main className="relative z-10 flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 pb-4 pt-1 flex items-center">
                <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-4 items-center">
                    {/* LEFT MARKETING COLUMN (Desktop Only) */}
                    <div className="hidden lg:flex lg:col-span-5 flex-col self-start pt-2 pointer-events-none">
                        {/* Upper-Left Text Block */}
                        <div className="max-w-[390px]">
                            {/* Academy Pill Badge */}
                            <div
                                className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border shadow-2xs mb-2.5 bg-nx-glass border-nx-field-line"
                            >
                                <Crown className="size-3.5 text-nx-gold-500" strokeWidth={2.3} />
                                <span
                                    className="text-[11px] font-semibold text-nx-ink-soft"
                                >
                                    Live chess coaching academy
                                </span>
                            </div>

                            {/* Serif Display Heading */}
                            <h1
                                className="font-display font-bold text-3xl xl:text-[38px] leading-[1.1] tracking-[-0.02em] mb-2.5 text-nx-ink"
                            >
                                {heroContent.title}
                            </h1>

                            {/* Subtitle */}
                            <p
                                className="text-xs xl:text-[13px] leading-relaxed mb-4 max-w-[350px] text-nx-body-strong"
                            >
                                {heroContent.subtitle}
                            </p>

                            {/* Login / Forgot-Password Highlight Card */}
                            {(variant === "login" || variant === "forgot-password") && (
                                <div
                                    className="max-w-[300px] rounded-2xl p-3.5 backdrop-blur-md border flex items-start gap-3 bg-nx-auth-note border-nx-line-glass shadow-nx-float"
                                >
                                    <div
                                        className="size-9 rounded-xl shrink-0 flex items-center justify-center border bg-nx-gold-tint border-nx-gold-line-medium text-nx-gold-ink"
                                    >
                                        <TrendingUp className="size-4" strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <div
                                            className="text-xs font-bold text-nx-ink"
                                        >
                                            <span className="dark:hidden">Progress you can see</span>
                                            <span className="hidden dark:inline">Practice between classes</span>
                                        </div>
                                        <p
                                            className="text-[11px] leading-snug mt-0.5 text-nx-body"
                                        >
                                            <span className="dark:hidden">Track your improvement with personalized guidance.</span>
                                            <span className="hidden dark:inline">Solve puzzles, play games and sharpen your skills.</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Registration Feature List (Positioned cleanly right beside the Knight) */}
                        {(variant === "student-register" ||
                            variant === "coach-register") && (
                                <div className="ml-auto mr-2 xl:mr-4 mt-14 space-y-3.5">
                                    {featureBullets.map(({ Icon, label }) => (
                                        <div key={label} className="flex items-center gap-3">
                                            <div
                                                className="size-9 rounded-xl shrink-0 flex items-center justify-center border shadow-xs bg-nx-gold-glass border-nx-gold-line-strong text-nx-gold-ink"
                                            >
                                                <Icon className="size-4" strokeWidth={2.2} />
                                            </div>
                                            <span
                                                className="text-xs font-bold leading-snug whitespace-pre-line text-nx-ink"
                                            >
                                                {label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

                    {/* RIGHT FORM CARD COLUMN */}
                    <div className="lg:col-span-7 flex justify-center lg:justify-end items-center">
                        <div
                            className={`w-full ${cardMaxWidthClass} rounded-[22px] backdrop-blur-xl border px-5 py-4 sm:px-7 sm:py-5 transition-all duration-300 bg-nx-auth-card border-nx-line shadow-nx-panel`}
                        >
                            {children}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}