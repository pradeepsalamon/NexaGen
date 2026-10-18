"use client";

import { useState, useEffect } from "react";
import { Pause, Play, Quote, Star } from "lucide-react";

const testimonials = [
  {
    name: "Devesh's Mother",
    location: "Mumbai",
    rating: 5,
    text: "Under the academy's superb guidance, my son got an international FIDE Rating. He has been learning for 5 years and won so many tournaments. The coaching quality is exceptional!",
    initials: "DM"
  },
  {
    name: "Architha's Parents",
    location: "Prayagraj",
    rating: 5,
    text: "Initially thought only for two months, but now she has been learning for over a year. She really enjoys the class and wants to continue. The Sunday tournaments are a highlight!",
    initials: "AP"
  },
  {
    name: "Aarav's Father",
    location: "Dubai",
    rating: 5,
    text: "We are very happy with the immense dedication and support from day one. Aarav has improved tremendously. The personalized attention is what sets this academy apart.",
    initials: "AF"
  },
  {
    name: "Sanchi's Mother",
    location: "Mumbai",
    rating: 5,
    text: "My Sanchi has been learning chess since she was 6 years old and won the Mumbai District Championship. She has won many tournaments, all thanks to the amazing coaching!",
    initials: "SM"
  },
  {
    name: "Raghul's Mother",
    location: "Chennai",
    rating: 5,
    text: "My son is only 6 years, and now he has won so many tournaments and wants to become a Grandmaster! Regular classes and structured curriculum make all the difference.",
    initials: "RM"
  },
  {
    name: "Reyansh's Mother",
    location: "Surat",
    rating: 5,
    text: "Reyansh started learning during the lockdown. Within one year, he got his FIDE rating and won multiple tournaments. The coaching methodology is truly world-class!",
    initials: "RM"
  }
];

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  // Paused by the button or by picking a slide; hovering/focusing holds it too.
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (paused || hovered || focused) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused, hovered, focused]);

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f8fafc] to-white" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up" style={{ transitionDelay: "0s" }}>
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Testimonials
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Parents <span className="gold-text">Trust</span> Us
          </h2>
          <p className="section-sub">Hear what our chess families have to say</p>
        </div>

        <div
          className="max-w-4xl mx-auto reveal reveal-up"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
          onFocus={() => setFocused(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ transitionDelay: "0.2s" }}
        >
          <div className="relative overflow-hidden">
            <div className="relative h-64 sm:h-56">
              {testimonials.map((testimonial, i) => (
                <div
                  aria-hidden={i !== activeIndex}
                  key={i}
                  className={`absolute inset-0 p-8 sm:p-12 rounded-2xl glass-strong shadow-[0_28px_60px_-40px_rgba(15,31,47,0.5)] transition-all duration-500 ease-in-out flex flex-col justify-center ${
                    i === activeIndex ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8 pointer-events-none"
                  }`}
                >
                  <Quote className="absolute top-6 right-8 w-14 h-14 text-[#1a3a52]/[0.07] fill-current" strokeWidth={1} />

                  <p className="text-lg sm:text-xl text-text-secondary leading-relaxed mb-6 italic relative z-10 line-clamp-3">
                    {testimonial.text}
                  </p>

                  <div className="flex items-center gap-4 relative z-10 mt-auto">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1a3a52] to-[#0f1f2f] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-[0_10px_20px_-12px_rgba(15,31,47,0.9)]">
                      {testimonial.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-text-primary">{testimonial.name}</div>
                      <div className="text-sm text-text-muted">{testimonial.location}</div>
                    </div>
                    <div className="ml-auto flex gap-0.5">
                      {Array.from({ length: testimonial.rating }).map((_, j) => (
                        <Star key={j} className="w-4 h-4 text-[#d4a843] fill-[#d4a843]" strokeWidth={0} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              aria-label={paused ? "Play testimonials" : "Pause testimonials"}
              className="mr-2 inline-flex size-8 items-center justify-center rounded-full border border-[#cbd8e4] text-[#1a3a52] transition-colors hover:bg-[#1a3a52]/5"
              onClick={() => setPaused((p) => !p)}
              type="button"
            >
              {paused ? (
                <Play aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              ) : (
                <Pause aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              )}
            </button>
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveIndex(i);
                  setPaused(true);
                }}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? "bg-[#1a3a52] w-8" : "bg-[#cbd8e4] hover:bg-[#1a3a52]/40 w-2.5"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
