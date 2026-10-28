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

const AUTH_BG_LIGHT = "/auth/auth_light.png";
const AUTH_BG_DARK = "/auth/auth_dark.png";

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
            className={`relative min-h-[100dvh] w-full overflow-x-hidden flex flex-col select-none transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#F4F7FB] text-[#071B41]"
                }`}
        >
            {/* ================= FULL-BLEED BACKGROUND ARTWORK ================= */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div
                    className={`absolute inset-0 ${isDark ? "bg-[#030D24]" : "bg-[#F4F7FB]"
                        }`}
                />

                {/* Light Mode Image */}
                <div
                    className={`absolute inset-0 transition-opacity duration-300 ${isDark ? "opacity-0" : "opacity-100"
                        }`}
                >
                    <Image
                        src={AUTH_BG_LIGHT}
                        alt="Nexa Chess Golden Knight Light Background"
                        fill
                        priority
                        quality={100}
                        sizes="100vw"
                        className="object-cover object-[12%_bottom] lg:object-[left_bottom]"
                    />
                    <div className="absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-[#F4F7FB] via-[#F4F7FB]/65 to-transparent" />
                </div>

                {/* Dark Mode Image */}
                <div
                    className={`absolute inset-0 transition-opacity duration-300 ${isDark ? "opacity-100" : "opacity-0"
                        }`}
                >
                    <Image
                        src={AUTH_BG_DARK}
                        alt="Nexa Chess Golden Knight Dark Background"
                        fill
                        priority
                        quality={100}
                        sizes="100vw"
                        className="object-cover object-[12%_bottom] lg:object-[left_bottom]"
                    />
                    <div className="absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-[#030D24] via-[#030D24]/65 to-transparent" />
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
                        src={
                            isDark
                                ? "/academy/nexa_logo_dark1.png"
                                : "/academy/nexa_logo_light1.png"
                        }
                        alt="NEXA Chess"
                        width={160}
                        height={44}
                        priority
                        className="h-8 sm:h-9 w-auto object-contain"
                    />
                </Link>

                {/* Segmented Sun / Moon Pill Toggle */}
                <button
                    onClick={toggleMode}
                    type="button"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    className={`inline-flex items-center gap-1 p-1 rounded-full backdrop-blur-md border shadow-xs transition-all duration-200 cursor-pointer ${isDark
                            ? "bg-[#0B1A38]/90 border-white/15"
                            : "bg-white/90 border-[#E2E8F0]"
                        }`}
                >
                    <span
                        className={`size-6 rounded-full flex items-center justify-center transition-all ${!isDark
                                ? "bg-[#FDF3DC] text-[#D49B35]"
                                : "text-[#8E98A8] hover:text-white"
                            }`}
                    >
                        <Sun className="size-3.5" strokeWidth={2.2} />
                    </span>
                    <span
                        className={`size-6 rounded-full flex items-center justify-center transition-all ${isDark
                                ? "bg-[#162952] text-[#E2B355]"
                                : "text-[#64748B] hover:text-[#071B41]"
                            }`}
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
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border shadow-2xs mb-2.5 ${isDark
                                        ? "bg-[#0B1A38]/90 border-white/15"
                                        : "bg-white/90 border-[#E2E8F0]"
                                    }`}
                            >
                                <Crown className="size-3.5 text-[#D49B35]" strokeWidth={2.3} />
                                <span
                                    className={`text-[11px] font-semibold ${isDark ? "text-white/90" : "text-[#071B41]"
                                        }`}
                                >
                                    Live chess coaching academy
                                </span>
                            </div>

                            {/* Serif Display Heading */}
                            <h1
                                className={`font-[family-name:var(--font-playfair)] font-bold text-3xl xl:text-[38px] leading-[1.1] tracking-[-0.02em] mb-2.5 ${isDark ? "text-white" : "text-[#071B41]"
                                    }`}
                            >
                                {heroContent.title}
                            </h1>

                            {/* Subtitle */}
                            <p
                                className={`text-xs xl:text-[13px] leading-relaxed mb-4 max-w-[350px] ${isDark ? "text-[#C1C4CC]" : "text-[#2F3847]"
                                    }`}
                            >
                                {heroContent.subtitle}
                            </p>

                            {/* Login / Forgot-Password Highlight Card */}
                            {(variant === "login" || variant === "forgot-password") && (
                                <div
                                    className={`max-w-[300px] rounded-2xl p-3.5 backdrop-blur-md border flex items-start gap-3 ${isDark
                                            ? "bg-[#091936]/90 border-white/15 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55)]"
                                            : "bg-white/92 border-[#E5E9F0] shadow-[0_10px_28px_-8px_rgba(7,27,65,0.12)]"
                                        }`}
                                >
                                    <div
                                        className={`size-9 rounded-xl shrink-0 flex items-center justify-center border ${isDark
                                                ? "bg-[#E2B355]/15 border-[#E2B355]/30 text-[#E2B355]"
                                                : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C88E2B]"
                                            }`}
                                    >
                                        <TrendingUp className="size-4" strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <div
                                            className={`text-xs font-bold ${isDark ? "text-white" : "text-[#071B41]"
                                                }`}
                                        >
                                            {isDark
                                                ? "Practice between classes"
                                                : "Progress you can see"}
                                        </div>
                                        <p
                                            className={`text-[11px] leading-snug mt-0.5 ${isDark ? "text-[#C1C4CC]" : "text-[#555C68]"
                                                }`}
                                        >
                                            {isDark
                                                ? "Solve puzzles, play games and sharpen your skills."
                                                : "Track your improvement with personalized guidance."}
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
                                                className={`size-9 rounded-xl shrink-0 flex items-center justify-center border shadow-xs ${isDark
                                                        ? "bg-[#0B1A38]/90 border-[#E2B355]/35 text-[#E2B355]"
                                                        : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C88E2B]"
                                                    }`}
                                            >
                                                <Icon className="size-4" strokeWidth={2.2} />
                                            </div>
                                            <span
                                                className={`text-xs font-bold leading-snug whitespace-pre-line ${isDark ? "text-white" : "text-[#071B41]"
                                                    }`}
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
                            className={`w-full ${cardMaxWidthClass} rounded-[22px] backdrop-blur-xl border px-5 py-4 sm:px-7 sm:py-5 transition-all duration-300 ${isDark
                                    ? "bg-[#071633]/92 border-white/12 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]"
                                    : "bg-white/95 border-[#E5E9F0] shadow-[0_20px_60px_-15px_rgba(7,27,65,0.16)]"
                                }`}
                        >
                            {children}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}