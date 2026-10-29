"use client";

import Image from "next/image";
import {
  User,
  Users,
  Handshake,
  ArrowRight,
  Check,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { ACADEMY_CLASS_FORMATS } from "../content";

// Section background artwork (already in public/academy/)
const SECTION_BG_LIGHT = "/programs/01_chess_reverie_light.webp";
const SECTION_BG_DARK = "/programs/02_chess_reverie_dark.webp";

// Update these 3 filenames if yours are named differently in public/academy/
const IMG_INDIVIDUAL = "/class/01_gold_king.webp";
const IMG_BATCH = "/class/02_black_gold_pawn.webp";
const IMG_CAMPS = "/class/03_black_gold_rook.webp";

interface LearningOption {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  pieceImage: string;
  features: string[];
  highlight: boolean;
}

// Formats come from content.ts (also published in llms.txt): the names are
// its names and the bullets restate its descriptions, so the page makes no
// claim the structured data doesn't (and the reverse). The subtitles stay one
// short line; a longer one runs under the piece artwork.
const [individualFormat, buddyFormat, groupFormat] = ACADEMY_CLASS_FORMATS;

const learningOptions: LearningOption[] = [
  {
    title: individualFormat.name,
    subtitle: "One-on-one coaching.",
    Icon: User,
    pieceImage: IMG_INDIVIDUAL,
    features: ["One-on-one coaching", "Personalised attention", "Flexible timing", "A custom curriculum"],
    highlight: false
  },
  {
    title: buddyFormat.name,
    subtitle: "Learn together with friends.",
    Icon: Handshake,
    pieceImage: IMG_BATCH,
    features: ["Learn together with friends", "Interactive and fun", "A friendly competitive setting"],
    highlight: true
  },
  {
    title: groupFormat.name,
    subtitle: "Coaching in a group.",
    Icon: Users,
    pieceImage: IMG_CAMPS,
    features: ["Collaborative coaching", "Affordable", "Team activities"],
    highlight: false
  }
];

export function ClassTypesSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <section
      id="class-types"
      className={`relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#F8FAFC] text-[#071B41]"
        }`}
    >
      {/* ================= SECTION BACKGROUND ARTWORK ================= */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Light Mode Twin Knights Background */}
        <Image
          src={SECTION_BG_LIGHT}
          alt="Nexa Chess Learning Formats Light Background"
          fill
          sizes="100vw"
          className={`object-cover object-top dark:hidden`}
        />

        {/* Dark Mode Twin Knights Background */}
        <Image
          src={SECTION_BG_DARK}
          alt="Nexa Chess Learning Formats Dark Background"
          fill
          sizes="100vw"
          className={`object-cover object-top hidden dark:block`}
        />

        {/* Smooth Top & Bottom Section Blend */}
        <div
          className={`absolute inset-0 ${isDark
              ? "bg-gradient-to-b from-[#030D24]/35 via-transparent to-[#030D24]/95"
              : "bg-gradient-to-b from-white/40 via-transparent to-[#F8FAFC]/95"
            }`}
          aria-hidden="true"
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Pill Eyebrow: [• LEARNING FORMATS] */}
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md ${isDark
                ? "bg-[#081736]/85 border-white/15 text-white"
                : "bg-white/90 border-[#E2E8F0] text-[#071B41]"
              }`}
          >
            <span className="size-2 rounded-full bg-[#D49B35]" />
            <span>LEARNING FORMATS</span>
          </div>

          {/* Two-Tone Serif Heading */}
          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.12] tracking-[-0.02em] mb-3.5">
            <span className={isDark ? "text-white" : "text-[#071B41]"}>
              Flexible Learning{" "}
            </span>
            <span className="block sm:inline text-[#C58927] dark:text-[#E2B355]">
              Options
            </span>
          </h2>

          {/* Subtitle */}
          <p
            className={`text-sm sm:text-base lg:text-[17px] leading-relaxed ${isDark ? "text-[#C8CDD6]" : "text-[#3B4454]"
              }`}
          >
            Choose a format tailored to your schedule, learning pace, and
            competitive goals.
          </p>
        </div>

        {/* ================= 3 LEARNING FORMAT CARDS ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-7 items-stretch">
          {learningOptions.map((opt) => {
            const isHighlighted = opt.highlight;
            const Icon = opt.Icon;

            const cardSurfaceClass = isHighlighted
              ? isDark
                ? "bg-[#071633]/92 border-[#E2B355] ring-1 ring-[#E2B355]/45 shadow-[0_16px_48px_-10px_rgba(226,179,85,0.22)]"
                : "bg-white/95 border-[#D49B35] ring-1 ring-[#D49B35]/40 shadow-[0_18px_45px_-12px_rgba(212,155,53,0.25)]"
              : isDark
                ? "bg-[#06132D]/90 border-white/12 hover:border-[#E2B355]/50 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.65)]"
                : "bg-white/95 border-[#E5E9F0] hover:border-[#D49B35]/60 shadow-[0_14px_36px_-10px_rgba(7,27,65,0.08)]";

            const iconBoxClass = isDark
              ? "bg-[#11244A]/90 border-[#E2B355]/30 text-[#E2B355]"
              : "bg-[#FDF4E2] border-[#F3DFB6] text-[#B87D20]";

            return (
              <div
                key={opt.title}
                className={`group relative flex flex-col rounded-[22px] border backdrop-blur-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${cardSurfaceClass}`}
              >
                {/* RIGHT-SIDE 3D PIECE ARTWORK LAYER */}
                <div
                  className="
                    pointer-events-none absolute top-0 right-0 bottom-14
                    w-[46%] sm:w-[48%] z-0 overflow-hidden select-none
                  "
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, black 38%, black 100%), linear-gradient(to top, transparent 0%, black 18%, black 100%)",
                    WebkitMaskComposite: "source-in",
                    maskImage:
                      "linear-gradient(to right, transparent 0%, black 38%, black 100%), linear-gradient(to top, transparent 0%, black 18%, black 100%)",
                    maskComposite: "intersect"
                  }}
                >
                  <Image
                    src={opt.pieceImage}
                    alt={opt.title}
                    fill
                    sizes="(max-width: 768px) 180px, 220px"
                    className={`object-cover object-[58%_center] scale-110 transition-transform duration-500 group-hover:scale-115 ${isDark ? "brightness-90 contrast-110" : "brightness-100"
                      }`}
                  />
                  {/* Extra Dark Mode Tint so bright JPEG skies blend seamlessly into dark navy cards */}
                  {isDark && (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-[#06132D] via-[#06132D]/35 to-transparent mix-blend-multiply"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* FOREGROUND CARD BODY */}
                <div className="relative z-10 p-5 sm:p-7 flex flex-col flex-1">
                  {/* Header: Side-by-side on Mobile, Stacked on Desktop (Exact match to mockup) */}
                  <div className="flex items-start md:flex-col gap-3.5 md:gap-0 mb-4 sm:mb-5 pr-16 md:pr-12">
                    <div
                      className={`size-10 sm:size-12 rounded-[12px] border flex items-center justify-center shrink-0 md:mb-5 transition-transform duration-200 group-hover:scale-105 ${iconBoxClass}`}
                    >
                      <Icon className="size-5 sm:size-[22px]" strokeWidth={2} />
                    </div>

                    <div>
                      <h3
                        className={`font-[family-name:var(--font-playfair)] font-bold text-xl sm:text-2xl leading-tight mb-1 sm:mb-1.5 ${isDark ? "text-white" : "text-[#071B41]"
                          }`}
                      >
                        {opt.title}
                      </h3>

                      <p
                        className={`text-xs sm:text-[13.5px] leading-snug ${isDark ? "text-[#C1C4CC]" : "text-[#4A5568]"
                          }`}
                      >
                        {opt.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-7 flex-1 pr-20 sm:pr-24">
                    {opt.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-2.5 text-xs sm:text-[13px] font-medium leading-snug ${isDark ? "text-[#E2E8F0]" : "text-[#2D3748]"
                          }`}
                      >
                        {/* Solid Gold Circle with White Checkmark */}
                        <span className="mt-0.5 size-4 rounded-full bg-gradient-to-b from-[#E5B85B] to-[#C88E2B] text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Check className="size-2.5 stroke-[3.2]" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Bottom CTA Button */}
                  <a
                    href="#demo"
                    className={`w-full h-10 sm:h-11 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 ${isHighlighted
                        ? "bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C] hover:from-[#EDC36E] hover:to-[#D89B32] text-[#071B41] shadow-[0_6px_20px_rgba(212,155,53,0.35)]"
                        : isDark
                          ? "bg-[#06132D]/90 hover:bg-[#0B1F47] text-white border border-white/20 hover:border-[#E2B355]/60"
                          : "bg-white hover:bg-[#F8FAFC] text-[#071B41] border border-[#DCE3EE] hover:border-[#C58927]"
                      }`}
                  >
                    <span>Learn More</span>
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