"use client";

import { type KeyboardEvent, useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { Section, SectionHeader } from "./parts";

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

function TestimonialCard({ item, muted = false }: { item: TestimonialItem; muted?: boolean }) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col gap-5 rounded-panel border bg-app-surface p-6 shadow-card",
        muted ? "border-app-border" : "border-primary"
      )}
    >
      <Quote aria-hidden="true" className="size-6 text-primary-ink" strokeWidth={2.25} />
      <blockquote className="flex-1 text-base text-app-text">&ldquo;{item.quote}&rdquo;</blockquote>
      <div aria-label="Rated 5 out of 5" className="flex gap-0.5" role="img">
        {Array.from({ length: 5 }, (_, i) => (
          <Star aria-hidden="true" className="size-4 fill-accent text-accent" key={i} />
        ))}
      </div>
      <figcaption className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, same as the home page */}
        <img alt="" className="size-10 shrink-0 rounded-full object-cover" src={item.avatar} />
        <span className="grid">
          <span className="text-sm font-semibold text-app-text">{item.parentName}</span>
          <span className="text-sm text-app-muted">{item.studentInfo}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(1);
  const total = testimonials.length;
  const at = (offset: number) => testimonials[(activeIndex + offset + total) % total];

  const handlePrev = useCallback(() => setActiveIndex((prev) => (prev - 1 + total) % total), [total]);
  const handleNext = useCallback(() => setActiveIndex((prev) => (prev + 1) % total), [total]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
  };

  return (
    <Section id="testimonials" labelledBy="testimonials-heading">
      <SectionHeader
        description="Real and proud impressions from families who have experienced our coaching."
        eyebrow="Testimonials"
        id="testimonials-heading"
        title="Parents trust us"
      />

      <div aria-roledescription="carousel" className="mt-12" onKeyDown={onKeyDown} role="region" aria-label="Testimonials">
        {/* The current card, with its neighbours beside it from lg. */}
        <div aria-live="polite" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="hidden lg:block">
            <TestimonialCard item={at(-1)} muted />
          </div>
          <TestimonialCard item={at(0)} />
          <div className="hidden lg:block">
            <TestimonialCard item={at(1)} muted />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <SimpleTooltip label="Previous testimonial">
            <Button aria-label="Previous testimonial" onClick={handlePrev} size="icon" variant="neutral">
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
          <div className="flex items-center">
            {testimonials.map((t, idx) => (
              <button
                aria-current={idx === activeIndex ? "true" : undefined}
                aria-label={`Go to testimonial ${idx + 1}`}
                className="flex size-6 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
                key={t.id}
                onClick={() => setActiveIndex(idx)}
                type="button"
              >
                <span
                  className={cn(
                    "h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none",
                    idx === activeIndex ? "w-5 bg-primary" : "w-2 bg-app-line-strong"
                  )}
                />
              </button>
            ))}
          </div>
          <SimpleTooltip label="Next testimonial">
            <Button aria-label="Next testimonial" onClick={handleNext} size="icon" variant="neutral">
              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
    </Section>
  );
}
