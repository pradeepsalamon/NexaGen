"use client";

import Image from "next/image";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

const SECTION_BG_LIGHT = "/programs/01_chess_reverie_light.webp";
const SECTION_BG_DARK = "/programs/02_chess_reverie_dark.webp";

type PieceType = "pawn" | "knight" | "king";

interface ProgramItem {
  level: string;
  subtitle: string;
  pieceType: PieceType;
  pieceImage: string;
  features: string[];
  tag: string;
  featured: boolean;
}

const programs: ProgramItem[] = [
  {
    level: "Beginner Level",
    subtitle: "For students starting their chess journey.",
    pieceType: "pawn",
    pieceImage: "/programs/01_gold_pawn.webp",
    features: [
      "Fundamentals of chess",
      "Basic tactics and strategy",
      "Live interactive classes",
      "Practice with peers",
      "Progress tracking"
    ],
    tag: "Foundation",
    featured: false
  },
  {
    level: "Intermediate Level",
    subtitle: "For players ready to improve their game.",
    pieceType: "knight",
    pieceImage: "/programs/02_gold_knight.webp",
    features: [
      "Advanced tactics",
      "Focused understanding",
      "Live online coaching",
      "Tournament preparation",
      "Performance analytics"
    ],
    tag: "Most Popular",
    featured: true
  },
  {
    level: "Advanced Level",
    subtitle: "For serious competitive players.",
    pieceType: "king",
    pieceImage: "/programs/03_black_gold_king.webp",
    features: [
      "Competitive training",
      "Deep calculation",
      "Personalized coaching",
      "Tournament preparation",
      "Advanced analysis"
    ],
    tag: "Mastery",
    featured: false
  }
];

function ChessCornerIcon({
  type,
  featured,
  isDark
}: {
  type: PieceType;
  featured: boolean;
  isDark: boolean;
}) {
  const colorClass = featured
    ? isDark
      ? "text-[#E2B355]"
      : "text-[#071B41]"
    : isDark
      ? "text-[#E2B355]"
      : "text-[#071B41]";

  if (type === "pawn") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`size-6 ${colorClass}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="5.5" r="3.2" />
        <path d="M9 9.5h6c.6 0 1 .4 1 1s-.4 1-1 1h-.6l1.3 5.5H8.3l1.3-5.5H9c-.6 0-1-.4-1-1s.4-1 1-1z" />
        <path d="M6.5 18.2h11c.8 0 1.5.7 1.5 1.5v.8H5v-.8c0-.8.7-1.5 1.5-1.5z" />
      </svg>
    );
  }

  if (type === "knight") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`size-6 ${colorClass}`}
        aria-hidden="true"
      >
        <path d="M16.5 3.5c-1.4 0-2.6.6-3.5 1.4L11 4l-.8 2.2L6.5 9c-.6.5-.8 1.3-.4 2l1 1.6c.4.6 1.2.8 1.9.4l2.2-1.1c.3.9 0 2.1-.8 3.1L8 17.5h8.8c.5-2.6 1.2-5.7 1.2-8.5 0-3-1.2-5.5-1.5-5.5z" />
        <path d="M6.5 18.8h11c.8 0 1.5.6 1.5 1.4v.8H5v-.8c0-.8.7-1.4 1.5-1.4z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`size-6 ${colorClass}`}
      aria-hidden="true"
    >
      <path d="M11.2 2h1.6v2h2v1.6h-2v1.8h-1.6V5.6h-2V4h2V2z" />
      <path d="M6 8.5l2.5 7.5h7L18 8.5l-3.2 2.1L12 7.8l-2.8 2.8L6 8.5z" />
      <path d="M6.5 17.2h11v1.4H6.5v-1.4zm-1 2.4h13c.6 0 1 .4 1 1v.9H4.5v-.9c0-.6.4-1 1-1z" />
    </svg>
  );
}

export function ProgramsSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <section
      id="programs"
      className={`relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#F8FAFC] text-[#071B41]"
        }`}
    >
      {/* ================= SECTION BACKGROUND ARTWORK ================= */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Light Mode Background (01_chess_reverie_light.png) */}
        <Image
          src={SECTION_BG_LIGHT}
          alt="Nexa Chess Programs Light Background"
          fill
          sizes="100vw"
          className={`object-cover object-top dark:hidden`}
        />

        {/* Dark Mode Background (02_chess_reverie_dark.png) */}
        <Image
          src={SECTION_BG_DARK}
          alt="Nexa Chess Programs Dark Background"
          fill
          sizes="100vw"
          className={`object-cover object-top hidden dark:block`}
        />

        {/* Soft Top & Bottom Vignettes so the section blends cleanly */}
        <div
          className={`absolute inset-0 ${isDark
            ? "bg-gradient-to-b from-[#030D24]/35 via-transparent to-[#030D24]/90"
            : "bg-gradient-to-b from-white/40 via-transparent to-[#F8FAFC]/95"
            }`}
          aria-hidden="true"
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Pill Eyebrow: [• OUR PROGRAMS] */}
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md ${isDark
              ? "bg-[#081736]/85 border-white/15 text-white"
              : "bg-white/90 border-[#E2E8F0] text-[#071B41]"
              }`}
          >
            <span className="size-2 rounded-full bg-[#D49B35]" />
            <span>OUR PROGRAMS</span>
          </div>

          {/* Two-Tone Serif Heading */}
          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.12] tracking-[-0.02em] mb-3.5">
            <span className={isDark ? "text-white" : "text-[#071B41]"}>
              Choose Your{" "}
            </span>
            <span className="text-[#C58927] dark:text-[#E2B355]">Path</span>
          </h2>

          {/* Subtitle */}
          <p
            className={`text-sm sm:text-base lg:text-[17px] leading-relaxed ${isDark ? "text-[#C8CDD6]" : "text-[#3B4454]"
              }`}
          >
            Structured learning paths designed for every stage of your chess
            journey.
          </p>
        </div>

        {/* ================= 3 PROGRAM CARDS GRID ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7 items-stretch">
          {programs.map((program) => {
            const isFeatured = program.featured;

            const cardSurfaceClass = isFeatured
              ? isDark
                ? "bg-[#071633]/92 border-[#E2B355] ring-1 ring-[#E2B355]/45 shadow-[0_16px_48px_-10px_rgba(226,179,85,0.22)]"
                : "bg-white/95 border-[#D49B35] ring-1 ring-[#D49B35]/40 shadow-[0_18px_45px_-12px_rgba(212,155,53,0.25)]"
              : isDark
                ? "bg-[#06132D]/90 border-white/12 hover:border-[#E2B355]/50 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.65)]"
                : "bg-white/95 border-[#E5E9F0] hover:border-[#D49B35]/60 shadow-[0_14px_36px_-10px_rgba(7,27,65,0.08)]";

            const tagBadgeClass = isFeatured
              ? isDark
                ? "bg-[#E2B355]/15 text-[#E2B355] border-[#E2B355]/35"
                : "bg-[#FDF3DC] text-[#071B41] border-[#F2DCB1]"
              : isDark
                ? "bg-[#0D2147] text-white/90 border-white/12"
                : "bg-[#EEF2F7] text-[#071B41] border-[#DCE3EE]";

            return (
              <div
                key={program.level}
                className={`group relative flex flex-col rounded-[22px] border backdrop-blur-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${cardSurfaceClass}`}
              >
                {/* ================= CARD BODY ================= */}
                <div className="relative z-10 p-6 sm:p-7 flex flex-col flex-1">
                  {/* Top Row: Tag Pill + Chess Silhouette Icon */}
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold border ${tagBadgeClass}`}
                    >
                      {isFeatured && (
                        <Sparkles
                          className="size-3.5 text-[#D49B35] dark:text-[#E2B355]"
                          strokeWidth={2.2}
                        />
                      )}
                      <span>{program.tag}</span>
                    </span>

                    <div className="relative z-20 transition-transform duration-200 group-hover:scale-110">
                      <ChessCornerIcon
                        type={program.pieceType}
                        featured={isFeatured}
                        isDark={isDark}
                      />
                    </div>
                  </div>

                  {/* Level Title */}
                  <h3
                    className={`relative z-20 font-[family-name:var(--font-playfair)] font-bold text-2xl sm:text-[26px] leading-tight mb-1.5 ${isDark ? "text-white" : "text-[#071B41]"
                      }`}
                  >
                    {program.level}
                  </h3>

                  {/* Subtitle */}
                  <p
                    className={`relative z-20 text-xs sm:text-[13.5px] mb-5 ${isDark ? "text-[#C1C4CC]" : "text-[#4A5568]"
                      }`}
                  >
                    {program.subtitle}
                  </p>

                  {/* Middle Content Area: Features on Left + 3D Chess Piece Artwork on Right */}
                  <div className="relative flex-1 min-h-[195px] sm:min-h-[205px] mb-5 flex items-start">
                    {/* Feature Checklist */}
                    <ul className="relative z-20 space-y-3 pr-24 sm:pr-28">
                      {program.features.map((feature) => (
                        <li
                          key={feature}
                          className={`flex items-center gap-2.5 text-xs sm:text-[13.5px] font-medium leading-snug ${isDark ? "text-[#E2E8F0]" : "text-[#2D3748]"
                            }`}
                        >
                          {/* Solid Gold Circle with Checkmark */}
                          <span className="size-4 rounded-full bg-gradient-to-b from-[#E5B85B] to-[#C88E2B] text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <Check className="size-2.5 stroke-[3.2]" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* 3D Chess Piece Artwork (Anchored Bottom-Right of the Checklist Area) */}
                    <div
                      className="
                        pointer-events-none absolute -right-6 -bottom-3
                        w-[165px] h-[215px] sm:w-[180px] sm:h-[225px]
                        z-10 select-none overflow-hidden rounded-bl-3xl
                      "
                      style={{
                        WebkitMaskImage:
                          "radial-gradient(ellipse 78% 82% at 68% 58%, black 48%, transparent 96%)",
                        maskImage:
                          "radial-gradient(ellipse 78% 82% at 68% 58%, black 48%, transparent 96%)"
                      }}
                    >
                      <Image
                        src={program.pieceImage}
                        alt={program.level}
                        fill
                        sizes="200px"
                        className="object-cover object-center scale-105 transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  </div>

                  {/* Bottom CTA Button */}
                  <a
                    href="#demo"
                    className={`relative z-20 w-full h-11 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 ${isFeatured
                      ? "bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C] hover:from-[#EDC36E] hover:to-[#D89B32] text-[#071B41] shadow-[0_6px_20px_rgba(212,155,53,0.35)]"
                      : isDark
                        ? "bg-[#06132D]/90 hover:bg-[#0B1F47] text-white border border-white/20 hover:border-[#E2B355]/60"
                        : "bg-white hover:bg-[#F8FAFC] text-[#071B41] border border-[#DCE3EE] hover:border-[#C58927]"
                      }`}
                  >
                    <span>Start Learning</span>
                    <ArrowRight className="size-4 stroke-[2.3]" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}