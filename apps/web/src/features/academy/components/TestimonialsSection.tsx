"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

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
  isActive: boolean;
  compact?: boolean;
}

function CardBody({ item, isActive, compact = false }: CardBodyProps) {
  return (
    <>
      <div className="flex justify-center mb-4">
        <div
          className={`size-11 rounded-full flex items-center justify-center transition-colors duration-700 ${isActive
              ? "bg-accent-soft text-accent-ink"
              : "bg-app-soft text-app-subtle"
            }`}
        >
          <DoubleQuoteIcon className="size-4 rotate-180" />
        </div>
      </div>

      <blockquote
        className={`text-center italic font-medium leading-[1.65] mb-5 transition-colors duration-700 ${compact ? "text-[13.5px]" : "text-[14.5px]"
          } ${isActive
            ? "text-app-text"
            : "text-app-muted"
          }`}
      >
        &ldquo;{item.quote}&rdquo;
      </blockquote>

      <div>
        <div className="flex items-center justify-center gap-1 mb-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`size-4 transition-opacity duration-700 text-accent fill-accent ${isActive ? "opacity-100" : "opacity-75"
                }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <img
            src={item.avatar}
            alt={item.parentName}
            className={`rounded-full object-cover shrink-0 border transition-colors duration-700 ${compact ? "size-10" : "size-11"
              } ${isActive ? "border-accent/50" : "border-app-surface/15"}`}
          />
          <div className="text-left">
            <div
              className="text-sm font-bold leading-tight text-app-text"
            >
              {item.parentName}
            </div>
            <div
              className="text-xs mt-0.5 text-app-muted"
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

  // Starts on index 1 ("Rahul Sharma") so the initial state matches the design image
  const [activeIndex, setActiveIndex] = useState(1);
  const total = testimonials.length;

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  // Arrow keys only while focus is inside the section (e.g. on its buttons),
  // never from a field elsewhere on the page.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
  };

  return (
    <section
      id="testimonials"
      onKeyDown={onKeyDown}
      className="relative py-16 sm:py-24 overflow-hidden transition-colors duration-300 select-none bg-app-background text-app-text"
    >
      <div className="relative max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= HEADER ================= */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Eyebrow Pill */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] mb-4 bg-app-surface border-app-border text-app-text shadow-2xs"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>TESTIMONIALS</span>
          </div>

          {/* Heading */}
          <h2
            className="text-3xl sm:text-4xl lg:text-[44px] font-bold font-[family-name:var(--font-playfair)] leading-[1.15] tracking-[-0.02em] mb-3 text-app-text"
          >
            Parents Trust Us
          </h2>

          {/* Subtitle */}
          <p
            className="text-xs sm:text-[15px] leading-relaxed max-w-[480px] mx-auto text-app-muted"
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
            className="absolute -left-5 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer bg-app-surface border-app-border text-app-text shadow-sm hover:border-accent hover:text-accent-ink"
          >
            <ChevronLeft className="size-4" strokeWidth={2.2} />
          </button>

          {/* Right Circular Arrow */}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next testimonial"
            className="absolute -right-5 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer bg-app-surface border-app-border text-app-text shadow-sm hover:border-accent hover:text-accent-ink"
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
                ? "z-20 opacity-100 bg-app-surface border-accent shadow-[0_20px_50px_-12px_rgb(var(--rgb-accent)/0.22)]"
                : isSide
                  ? "z-10 cursor-pointer bg-app-surface border-app-border opacity-50 hover:opacity-75 shadow-[0_8px_28px_-12px_rgb(var(--rgb-brand-800)/0.06)]"
                  : `z-0 opacity-0 pointer-events-none bg-app-surface border-app-border`;

              return (
                <div
                  key={item.id}
                  onClick={isSide ? () => setActiveIndex(idx) : undefined}
                  aria-hidden={!isActive}
                  style={{ transform: desktopTransform(offset) }}
                  className={`[grid-area:1/1] w-[42%] min-h-[355px] rounded-[22px] border-[1.5px] px-8 py-9 flex flex-col justify-between ${MOTION} ${stateClasses}`}
                >
                  <CardBody item={item} isActive={isActive} />
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
                    ? "w-6 bg-accent"
                    : "w-2 bg-app-border hover:bg-app-subtle"
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
                ? "z-10 opacity-100 bg-app-surface border-app-border shadow-[0_14px_38px_-12px_rgb(var(--rgb-brand-800)/0.08)]"
                : `z-0 opacity-0 pointer-events-none bg-app-surface border-app-border`;

              return (
                <div
                  key={item.id}
                  aria-hidden={!isActive}
                  style={{ transform: mobileTransform(offset) }}
                  className={`[grid-area:1/1] rounded-[22px] border-[1.5px] px-6 py-7 flex flex-col justify-between ${MOTION} ${stateClasses}`}
                >
                  <CardBody
                    item={item}
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
              className="size-9 rounded-full border flex items-center justify-center transition-colors bg-app-surface border-app-border text-app-text shadow-2xs"
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
                      ? "w-5 bg-accent"
                      : "w-1.5 bg-app-border"
                      }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next testimonial"
              className="size-9 rounded-full border flex items-center justify-center transition-colors bg-app-surface border-app-border text-app-text shadow-2xs"
            >
              <ChevronRight className="size-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}