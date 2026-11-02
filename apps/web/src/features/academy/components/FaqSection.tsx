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
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section
      id="faq"
      className="relative py-16 sm:py-24 overflow-hidden transition-colors duration-300 select-none bg-app-background text-app-text"
    >
      <div className="relative max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= HEADER ================= */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          {/* Eyebrow Pill */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] mb-4 bg-app-surface border-app-border text-app-text shadow-2xs"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>FREQUENTLY ASKED</span>
          </div>

          {/* 2-Line Serif Heading */}
          <h2
            className="text-3xl sm:text-4xl lg:text-[44px] font-bold font-[family-name:var(--font-playfair)] leading-[1.14] tracking-[-0.02em] mb-3 text-app-text"
          >
            Online Chess Classes: Your
            <br />
            Questions
          </h2>

          {/* Subtitle */}
          <p
            className="text-xs sm:text-[15px] leading-relaxed max-w-[460px] text-app-muted"
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
                className="absolute inset-0 rounded-[32px] -skew-y-[6deg] transition-colors duration-300 bg-accent-soft border border-accent/80 shadow-[0_20px_50px_-15px_rgb(var(--rgb-accent)/0.12)]"
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
                    className="object-contain object-center scale-110 dark:hidden"
                  />
                  <Image
                    src={FAQ_IMG_DARK}
                    alt="Still have a question illustration"
                    fill
                    sizes="280px"
                    className="object-contain object-center scale-110 hidden dark:block"
                  />
                </div>

                <h3
                  className="text-xl font-bold mb-1.5 leading-snug text-app-text"
                >
                  Still have a question?
                </h3>

                <p
                  className="text-[13px] leading-relaxed mb-5 text-app-muted"
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
                    bg-gradient-to-r from-accent via-accent to-accent-hover
                    hover:from-accent hover:to-accent-hover
                    text-on-accent font-bold text-xs sm:text-[13px]
                    shadow-[0_6px_18px_rgb(var(--rgb-accent)/0.32)]
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
              className="lg:hidden rounded-2xl p-4 sm:p-5 border flex items-center gap-4 bg-accent-soft border-accent/45 shadow-xs"
            >
              {/* Left Speech Bubble Question Icon */}
              <div
                className="relative size-14 sm:size-16 rounded-full shrink-0 flex items-center justify-center border bg-accent-soft border-accent/45 text-accent-ink shadow-2xs"
              >
                <span className="font-[family-name:var(--font-playfair)] font-extrabold text-2xl sm:text-3xl leading-none">
                  ?
                </span>
                {/* Speech bubble tail */}
                <span
                  className="absolute -bottom-1 left-3 size-3 rotate-45 border-b border-r bg-accent-soft border-accent/45"
                  aria-hidden="true"
                />
              </div>

              {/* Right Text & CTA */}
              <div className="flex-1 min-w-0 text-left">
                <h3
                  className="text-sm sm:text-base font-bold leading-tight text-app-text"
                >
                  Still have a question?
                </h3>
                <p
                  className="text-xs mt-0.5 mb-2.5 text-app-muted"
                >
                  Our team is here to help you.
                </p>
                <a
                  href="#contact"
                  className="
                    inline-flex items-center justify-center gap-1.5
                    h-9 px-4 rounded-lg
                    bg-gradient-to-r from-accent via-accent to-accent-hover
                    text-on-accent font-bold text-xs
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
                      ? "bg-accent-soft border-accent shadow-[0_8px_24px_-10px_rgb(var(--rgb-accent)/0.16)]"
                      : "bg-app-surface border-app-border hover:border-accent/50 shadow-[0_2px_8px_rgb(var(--rgb-brand-800)/0.02)]"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(index)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5">
                      <div className="shrink-0 flex items-center justify-center text-accent-ink">
                        <Icon className="size-4 sm:size-[18px]" strokeWidth={2.1} />
                      </div>
                      <h3
                        className="text-xs sm:text-[14px] font-bold leading-snug text-app-text"
                      >
                        {item.question}
                      </h3>
                    </div>

                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-accent-ink transition-transform duration-300 ${isOpen ? "rotate-180" : ""
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
                      className="ml-7 sm:ml-[32px] mb-2.5 h-[1px] bg-app-border/70"
                      aria-hidden="true"
                    />
                    <p
                      className="text-xs sm:text-[13px] leading-relaxed pl-7 sm:pl-[32px] pr-2 text-app-muted"
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