"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  BookOpen,
  Users,
  Award,
  Calendar,
  Video,
  ShieldCheck,
  Star,
  ArrowRight
} from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { ACADEMY_FAQ } from "../content";

const FAQ_IMG_LIGHT = "/faq/faq_light.webp";
const FAQ_IMG_DARK = "/faq/faq_dark.webp";

const faqIcons = [
  BookOpen,    // What is Nexa Chess Academy?
  Users,       // Who can join the classes?
  Users,       // What age groups do you teach?
  Award,       // Do you provide certificates?
  Calendar,    // Do you offer trial classes?
  Video,       // Are the classes live?
  ShieldCheck, // How are coaches selected?
  Star         // What makes Nexa Chess different?
];

export function FaqSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section
      id="faq"
      className={`relative py-16 sm:py-24 overflow-hidden transition-colors duration-300 select-none ${isDark ? "bg-[#030D24] text-white" : "bg-[#FAFBFD] text-[#071B41]"
        }`}
    >
      <div className="relative max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= HEADER ================= */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          {/* Eyebrow Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] mb-4 ${isDark
                ? "bg-[#08152E] border-white/12 text-white"
                : "bg-white border-[#E2E8F0] text-[#071B41] shadow-2xs"
              }`}
          >
            <span className="size-2 rounded-full bg-[#D49B35] dark:bg-[#E2B355]" />
            <span>FREQUENTLY ASKED</span>
          </div>

          {/* 2-Line Serif Heading */}
          <h2
            className={`text-3xl sm:text-4xl lg:text-[44px] font-bold font-[family-name:var(--font-playfair)] leading-[1.14] tracking-[-0.02em] mb-3 ${isDark ? "text-white" : "text-[#071B41]"
              }`}
          >
            Online Chess Classes: Your
            <br />
            Questions
          </h2>

          {/* Subtitle */}
          <p
            className={`text-xs sm:text-[15px] leading-relaxed max-w-[460px] ${isDark ? "text-[#B8C1D1]" : "text-[#4A5568]"
              }`}
          >
            Find answers to common questions about our programs, coaching, and
            trial classes.
          </p>
        </div>

        {/* ================= MAIN CONTENT GRID ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
          {/* ================= LEFT COLUMN: SUPPORT CARD ================= */}
          <div className="lg:col-span-4 w-full">
            {/* 1. DESKTOP TILTED / SLANTED SUPPORT CARD (Matches Desktop Mockup) */}
            <div className="hidden lg:block relative w-full max-w-[310px] mx-auto pt-3 pb-3">
              {/* Skewed Background Surface */}
              <div
                className={`absolute inset-0 rounded-[32px] -skew-y-[6deg] transition-colors duration-300 ${isDark
                    ? "bg-[#06132B] border border-white/8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)]"
                    : "bg-[#FBF6EC] border border-[#F2E5C9]/80 shadow-[0_20px_50px_-15px_rgba(187,139,55,0.12)]"
                  }`}
                aria-hidden="true"
              />

              {/* Unskewed Inner Content */}
              <div className="relative z-10 px-7 pt-7 pb-9 flex flex-col items-start text-left">
                {/* 3D Speech Bubble Artwork */}
                <div className="relative w-full h-[210px] mb-3 flex items-center justify-center">
                  <Image
                    src={FAQ_IMG_LIGHT}
                    alt="Still have a question illustration"
                    fill
                    sizes="280px"
                    className={`object-contain object-center scale-110 dark:hidden`}
                  />
                  <Image
                    src={FAQ_IMG_DARK}
                    alt="Still have a question illustration"
                    fill
                    sizes="280px"
                    className={`object-contain object-center scale-110 hidden dark:block`}
                  />
                </div>

                <h3
                  className={`text-xl font-bold mb-1.5 leading-snug ${isDark ? "text-white" : "text-[#071B41]"
                    }`}
                >
                  Still have a question?
                </h3>

                <p
                  className={`text-[13px] leading-relaxed mb-5 ${isDark ? "text-[#A9B2C3]" : "text-[#4A5568]"
                    }`}
                >
                  Our team is here to help you.
                  <br />
                  Get in touch anytime.
                </p>

                <a
                  href="#contact"
                  className="
                    inline-flex items-center justify-center gap-2
                    h-11 px-6 rounded-xl
                    bg-gradient-to-r from-[#E6B960] via-[#DDA843] to-[#CE942E]
                    hover:from-[#EDC36E] hover:to-[#D89B32]
                    text-[#071B41] font-bold text-xs sm:text-[13px]
                    shadow-[0_6px_18px_rgba(204,146,44,0.32)]
                    transition-all duration-200 hover:-translate-y-0.5
                  "
                >
                  <span>Contact Support</span>
                  <ArrowRight className="size-3.5 stroke-[2.5]" />
                </a>
              </div>
            </div>

            {/* 2. MOBILE HORIZONTAL SUPPORT BANNER (Matches Mobile Mockup) */}
            <div
              className={`lg:hidden rounded-2xl p-4 sm:p-5 border flex items-center gap-4 ${isDark
                  ? "bg-[#071530] border-white/10 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.65)]"
                  : "bg-[#FBF6EC] border-[#F0E2C4] shadow-xs"
                }`}
            >
              {/* Left Speech Bubble Question Icon */}
              <div
                className={`relative size-14 sm:size-16 rounded-full shrink-0 flex items-center justify-center border ${isDark
                    ? "bg-[#0D1E3D] border-white/12 text-[#E2B355]"
                    : "bg-[#FDF8EE] border-[#F3DFB6] text-[#C88E2B] shadow-2xs"
                  }`}
              >
                <span className="font-[family-name:var(--font-playfair)] font-extrabold text-2xl sm:text-3xl leading-none">
                  ?
                </span>
                {/* Speech bubble tail */}
                <span
                  className={`absolute -bottom-1 left-3 size-3 rotate-45 border-b border-r ${isDark
                      ? "bg-[#0D1E3D] border-white/12"
                      : "bg-[#FDF8EE] border-[#F3DFB6]"
                    }`}
                  aria-hidden="true"
                />
              </div>

              {/* Right Text & CTA */}
              <div className="flex-1 min-w-0 text-left">
                <h3
                  className={`text-sm sm:text-base font-bold leading-tight ${isDark ? "text-white" : "text-[#071B41]"
                    }`}
                >
                  Still have a question?
                </h3>
                <p
                  className={`text-xs mt-0.5 mb-2.5 ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                    }`}
                >
                  Our team is here to help you.
                </p>
                <a
                  href="#contact"
                  className="
                    inline-flex items-center justify-center gap-1.5
                    h-9 px-4 rounded-lg
                    bg-gradient-to-r from-[#E6B960] via-[#DDA843] to-[#CE942E]
                    text-[#071B41] font-bold text-xs
                    shadow-xs
                  "
                >
                  <span>Contact Support</span>
                  <ArrowRight className="size-3.5 stroke-[2.5]" />
                </a>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: 8 FAQ ACCORDION ITEMS ================= */}
          <div className="lg:col-span-8 space-y-2.5 sm:space-y-3">
            {ACADEMY_FAQ.map((item, index) => {
              const isOpen = openIndex === index;
              const Icon = faqIcons[index] || BookOpen;

              return (
                <div
                  key={item.question}
                  className={`rounded-[14px] border transition-all duration-200 overflow-hidden ${isOpen
                      ? isDark
                        ? "bg-[#0D192E] border-[#C8963E] shadow-[0_8px_28px_-10px_rgba(212,155,53,0.18)]"
                        : "bg-[#FCF9F2] border-[#E0B55C] shadow-[0_8px_24px_-10px_rgba(212,155,53,0.16)]"
                      : isDark
                        ? "bg-[#07142B] border-white/10 hover:border-[#E2B355]/40"
                        : "bg-white border-[#E6EAF0] hover:border-[#D49B35]/50 shadow-[0_2px_8px_rgba(7,27,65,0.02)]"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(index)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5">
                      <div className="shrink-0 flex items-center justify-center text-[#C88E2B] dark:text-[#E2B355]">
                        <Icon className="size-4 sm:size-[18px]" strokeWidth={2.1} />
                      </div>
                      <h3
                        className={`text-xs sm:text-[14px] font-bold leading-snug ${isDark ? "text-white" : "text-[#071B41]"
                          }`}
                      >
                        {item.question}
                      </h3>
                    </div>

                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-[#C88E2B] dark:text-[#E2B355] transition-transform duration-300 ${isOpen ? "rotate-180" : ""
                        }`}
                      strokeWidth={2.4}
                    />
                  </button>

                  {/* Accordion Body */}
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen
                        ? "max-h-[360px] opacity-100 px-4 sm:px-5 pb-4 sm:pb-5"
                        : "max-h-0 opacity-0 px-4 sm:px-5 pb-0"
                      }`}
                  >
                    {/* Subtle divider line matching the open card in the design */}
                    <div
                      className={`ml-7 sm:ml-[32px] mb-2.5 h-[1px] ${isDark ? "bg-white/10" : "bg-[#E9DFC8]/70"
                        }`}
                      aria-hidden="true"
                    />
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed pl-7 sm:pl-[32px] pr-2 ${isDark ? "text-[#C1C4CC]" : "text-[#4A5568]"
                        }`}
                    >
                      {item.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}