"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

interface TestimonialItem {
  id: number;
  quote: string;
  parentName: string;
  studentInfo: string;
  avatar: string;
}

const testimonials: TestimonialItem[] = [
  {
    id: 0,
    quote:
      "My daughter's confidence has grown so much. The structured lessons and regular feedback really make a difference.",
    parentName: "Priya Mehta",
    studentInfo: "Parent of Ananya (Age 11)",
    avatar:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=160&q=80"
  },
  {
    id: 1,
    quote:
      "Nexa Chess has been an amazing experience for my son. The coaches are patient, professional, and truly care about their students' progress. He gained 200 rating points in just 6 months!",
    parentName: "Rahul Sharma",
    studentInfo: "Parent of Aarav (Age 9)",
    avatar:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80"
  },
  {
    id: 2,
    quote:
      "Professional coaching, excellent curriculum, and a supportive team. We've seen real improvement in both game and attitude.",
    parentName: "Vikram Iyer",
    studentInfo: "Parent of Rohan (Age 10)",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80"
  },
  {
    id: 3,
    quote:
      "The Sunday tournament practice sessions transformed how my son handles time pressure. His coach reviews every game with patience and clarity.",
    parentName: "Sneha Nair",
    studentInfo: "Parent of Dev (Age 8)",
    avatar:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=160&q=80"
  },
  {
    id: 4,
    quote:
      "From learning piece movements to winning his first school trophy, the step-by-step mentoring at Nexa Chess has been phenomenal.",
    parentName: "Karthik Sundaram",
    studentInfo: "Parent of Pranav (Age 12)",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80"
  },
  {
    id: 5,
    quote:
      "Flexible timings and deeply dedicated FIDE-rated coaches. My kids look forward to their chess class more than any other activity!",
    parentName: "Meera Krishnan",
    studentInfo: "Parent of Diya (Age 7)",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80"
  }
];

function DoubleQuoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z" />
    </svg>
  );
}

/**
 * Circular offset of a card from the active one.
 * 0 = active, -1 = left neighbour, 1 = right neighbour, others = off-stage.
 */
function getOffset(index: number, active: number, total: number) {
  const half = Math.floor(total / 2);
  return ((index - active + half + total) % total) - half;
}

/** 3D "coverflow" pose for the desktop carousel. */
function desktopTransform(offset: number) {
  const abs = Math.abs(offset);
  const dir = Math.sign(offset);

  if (abs === 0) {
    return "translate3d(0%, 0px, 0px) rotateY(0deg) scale(1)";
  }
  if (abs === 1) {
    return `translate3d(${dir * 80}%, 0px, -90px) rotateY(${-dir * 25}deg) scale(0.86)`;
  }
  // Off-stage: pushed further back and out, invisible
  return `translate3d(${dir * 120}%, 0px, -260px) rotateY(${-dir * 40}deg) scale(0.7)`;
}

/** 3D flip-through pose for the mobile single-card carousel. */
function mobileTransform(offset: number) {
  if (offset === 0) {
    return "translate3d(0%, 0px, 0px) rotateY(0deg) scale(1)";
  }
  const dir = Math.sign(offset);
  return `translate3d(${dir * 60}%, 0px, -180px) rotateY(${-dir * 50}deg) scale(0.85)`;
}

interface CardBodyProps {
  item: TestimonialItem;
  isDark: boolean;
  isActive: boolean;
  compact?: boolean;
}

function CardBody({ item, isDark, isActive, compact = false }: CardBodyProps) {
  return (
    <>
      <div className="flex justify-center mb-4">
        <div
          className={`size-11 rounded-full flex items-center justify-center transition-colors duration-700 ${isActive
              ? isDark
                ? "bg-[#E2B355]/15 text-[#E2B355]"
                : "bg-[#FDF3DC] text-[#C58927]"
              : isDark
                ? "bg-white/8 text-[#8E98A8]"
                : "bg-[#F1F5F9] text-[#94A3B8]"
            }`}
        >
          <DoubleQuoteIcon className="size-4 rotate-180" />
        </div>
      </div>

      <blockquote
        className={`text-center italic font-medium leading-[1.65] mb-5 transition-colors duration-700 ${compact ? "text-[13.5px]" : "text-[14.5px]"
          } ${isActive
            ? isDark
              ? "text-white"
              : "text-[#071B41]"
            : isDark
              ? "text-[#B8C1D1]"
              : "text-[#4A5568]"
          }`}
      >
        &ldquo;{item.quote}&rdquo;
      </blockquote>

      <div>
        <div className="flex items-center justify-center gap-1 mb-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`size-4 transition-opacity duration-700 text-[#E2A839] fill-[#E2A839] ${isActive ? "opacity-100" : "opacity-75"
                }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <img
            src={item.avatar}
            alt={item.parentName}
            className={`rounded-full object-cover shrink-0 border transition-colors duration-700 ${compact ? "size-10" : "size-11"
              } ${isActive ? "border-[#E2B355]/50" : "border-white/15"}`}
          />
          <div className="text-left">
            <div
              className={`text-sm font-bold leading-tight ${isDark ? "text-white" : "text-[#071B41]"
                }`}
            >
              {item.parentName}
            </div>
            <div
              className={`text-xs mt-0.5 ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                }`}
            >
              {item.studentInfo}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Shared smooth easing (fast start, long soft landing)
const MOTION =
  "transition-[transform,opacity,box-shadow,background-color,border-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none will-change-transform [backface-visibility:hidden]";

export function TestimonialsSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  // Starts on index 1 ("Rahul Sharma") so the initial state matches the design image
  const [activeIndex, setActiveIndex] = useState(1);
  const total = testimonials.length;

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <section
      id="testimonials"
      className={`relative py-16 sm:py-24 overflow-hidden transition-colors duration-300 select-none ${isDark ? "bg-[#030D24] text-white" : "bg-[#FAFBFD] text-[#071B41]"
        }`}
    >
      <div className="relative max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= HEADER ================= */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Eyebrow Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] mb-4 ${isDark
              ? "bg-[#08152E] border-white/12 text-white"
              : "bg-white border-[#E2E8F0] text-[#071B41] shadow-2xs"
              }`}
          >
            <span className="size-2 rounded-full bg-[#D49B35] dark:bg-[#E2B355]" />
            <span>TESTIMONIALS</span>
          </div>

          {/* Heading */}
          <h2
            className={`text-3xl sm:text-4xl lg:text-[44px] font-bold font-[family-name:var(--font-playfair)] leading-[1.15] tracking-[-0.02em] mb-3 ${isDark ? "text-white" : "text-[#071B41]"
              }`}
          >
            Parents Trust Us
          </h2>

          {/* Subtitle */}
          <p
            className={`text-xs sm:text-[15px] leading-relaxed max-w-[480px] mx-auto ${isDark ? "text-[#B8C1D1]" : "text-[#4A5568]"
              }`}
          >
            Real and proud impressions from families who have experienced our
            coaching.
          </p>
        </div>

        {/* ================= DESKTOP 3D COVERFLOW CAROUSEL ================= */}
        <div className="hidden lg:block relative">
          {/* Left Circular Arrow */}
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous testimonial"
            className={`absolute -left-5 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer ${isDark
              ? "bg-[#081632] border-white/15 text-white hover:border-[#E2B355] hover:text-[#E2B355]"
              : "bg-white border-[#E2E8F0] text-[#071B41] shadow-sm hover:border-[#C58927] hover:text-[#C58927]"
              }`}
          >
            <ChevronLeft className="size-4" strokeWidth={2.2} />
          </button>

          {/* Right Circular Arrow */}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next testimonial"
            className={`absolute -right-5 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer ${isDark
              ? "bg-[#081632] border-white/15 text-white hover:border-[#E2B355] hover:text-[#E2B355]"
              : "bg-white border-[#E2E8F0] text-[#071B41] shadow-sm hover:border-[#C58927] hover:text-[#C58927]"
              }`}
          >
            <ChevronRight className="size-4" strokeWidth={2.2} />
          </button>

          {/*
            All cards live in the same grid cell and are posed in 3D by their
            offset from the active card. Because the cards stay mounted, CSS
            transitions glide each one to its new position when the index changes.
          */}
          <div className="grid items-stretch justify-items-center px-4 py-6 [perspective:1400px]">
            {testimonials.map((item, idx) => {
              const offset = getOffset(idx, activeIndex, total);
              const abs = Math.abs(offset);
              const isActive = abs === 0;
              const isSide = abs === 1;

              const stateClasses = isActive
                ? isDark
                  ? "z-20 opacity-100 bg-[#081736] border-[#D49B35]/85 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8),0_0_32px_rgba(212,155,53,0.14)]"
                  : "z-20 opacity-100 bg-white border-[#E8BE69] shadow-[0_20px_50px_-12px_rgba(212,155,53,0.22)]"
                : isSide
                  ? isDark
                    ? "z-10 cursor-pointer bg-[#06132C] border-white/10 opacity-75 hover:opacity-95 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]"
                    : "z-10 cursor-pointer bg-white border-[#EEF2F7] opacity-50 hover:opacity-75 shadow-[0_8px_28px_-12px_rgba(7,27,65,0.06)]"
                  : `z-0 opacity-0 pointer-events-none ${isDark
                    ? "bg-[#06132C] border-white/10"
                    : "bg-white border-[#EEF2F7]"
                  }`;

              return (
                <div
                  key={item.id}
                  onClick={isSide ? () => setActiveIndex(idx) : undefined}
                  aria-hidden={!isActive}
                  style={{ transform: desktopTransform(offset) }}
                  className={`[grid-area:1/1] w-[42%] min-h-[355px] rounded-[22px] border-[1.5px] px-8 py-9 flex flex-col justify-between ${MOTION} ${stateClasses}`}
                >
                  <CardBody item={item} isDark={isDark} isActive={isActive} />
                </div>
              );
            })}
          </div>

          {/* Desktop 6 Pagination Dots */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {testimonials.map((t, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Go to testimonial ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${isActive
                    ? "w-6 bg-[#D49B35] dark:bg-[#E2B355]"
                    : isDark
                      ? "w-2 bg-white/25 hover:bg-white/45"
                      : "w-2 bg-[#CBD5E1] hover:bg-[#94A3B8]"
                    }`}
                />
              );
            })}
          </div>
        </div>

        {/* ================= MOBILE 3D FLIP CAROUSEL ================= */}
        <div className="lg:hidden max-w-[380px] mx-auto">
          <div className="grid items-stretch py-2 [perspective:1200px]">
            {testimonials.map((item, idx) => {
              const offset = getOffset(idx, activeIndex, total);
              const isActive = offset === 0;

              const stateClasses = isActive
                ? isDark
                  ? "z-10 opacity-100 bg-[#081736] border-[#D49B35]/80 shadow-[0_18px_45px_-12px_rgba(0,0,0,0.75)]"
                  : "z-10 opacity-100 bg-white border-[#E5E9F0] shadow-[0_14px_38px_-12px_rgba(7,27,65,0.08)]"
                : `z-0 opacity-0 pointer-events-none ${isDark
                  ? "bg-[#06132C] border-white/10"
                  : "bg-white border-[#EEF2F7]"
                }`;

              return (
                <div
                  key={item.id}
                  aria-hidden={!isActive}
                  style={{ transform: mobileTransform(offset) }}
                  className={`[grid-area:1/1] rounded-[22px] border-[1.5px] px-6 py-7 flex flex-col justify-between ${MOTION} ${stateClasses}`}
                >
                  <CardBody
                    item={item}
                    isDark={isDark}
                    isActive={isActive}
                    compact
                  />
                </div>
              );
            })}
          </div>

          {/* Mobile Bottom Navigation Bar */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous testimonial"
              className={`size-9 rounded-full border flex items-center justify-center transition-colors ${isDark
                ? "bg-[#081632] border-white/15 text-white"
                : "bg-white border-[#E2E8F0] text-[#071B41] shadow-2xs"
                }`}
            >
              <ChevronLeft className="size-4" strokeWidth={2.2} />
            </button>

            <div className="flex items-center gap-1.5">
              {testimonials.map((t, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`Go to testimonial ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${isActive
                      ? "w-5 bg-[#D49B35] dark:bg-[#E2B355]"
                      : isDark
                        ? "w-1.5 bg-white/25"
                        : "w-1.5 bg-[#CBD5E1]"
                      }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next testimonial"
              className={`size-9 rounded-full border flex items-center justify-center transition-colors ${isDark
                ? "bg-[#081632] border-white/15 text-white"
                : "bg-white border-[#E2E8F0] text-[#071B41] shadow-2xs"
                }`}
            >
              <ChevronRight className="size-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}