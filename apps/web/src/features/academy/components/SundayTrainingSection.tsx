"use client";

import { useRef, useState, useEffect } from "react";
import { Trophy, TrendingUp, CalendarDays, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsVisible } from "../hooks/useIsVisible";

const achievements: { value: number; suffix: string; label: string; Icon: LucideIcon }[] = [
  { value: 50, suffix: "+", label: "Tournament Players", Icon: Trophy },
  { value: 75, suffix: "%", label: "Win Rate Improvement", Icon: TrendingUp },
  { value: 48, suffix: "+", label: "Sunday Sessions/Year", Icon: CalendarDays },
  { value: 100, suffix: "+", label: "Tournaments Covered", Icon: Target }
];

function AnimatedCounter({ target, suffix, isInView }: { target: number; suffix: string; isInView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(target);
      return;
    }
    let start = 0;
    const duration = 2000;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return (
    <span className="text-3xl sm:text-4xl font-bold gold-text font-[family-name:var(--font-playfair)] tabular-nums">
      {count}
      {suffix}
    </span>
  );
}

export function SundayTrainingSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useIsVisible(ref);

  return (
    <section id="sunday-training" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 chess-pattern opacity-15" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="reveal reveal-up" style={{ transitionDelay: "0s" }}>
            <span className="eyebrow mb-5">
              <span className="eyebrow-dot" />
              Special Sunday Sessions
            </span>
            <h2 className="section-title font-[family-name:var(--font-playfair)] mb-6">
              Sunday <span className="gold-text">Tournament</span> Training
            </h2>
            <p className="text-text-secondary text-lg leading-relaxed mb-8">
              Special Sunday sessions focused on tournament preparation, practical gameplay, analysis,
              rapid chess improvement, and competitive confidence. Take your game to the next level
              with intensive weekend training.
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 mb-8">
              {[
                "Tournament Simulation",
                "Game Analysis",
                "Rapid Improvement",
                "Competitive Play",
                "Opening Prep",
                "Endgame Drills"
              ].map((feature, i) => (
                <div
                  key={feature}
                  className="flex items-center gap-2.5 text-sm text-text-secondary reveal reveal-up"
                  style={{ transitionDelay: `${0.3 + i * 0.1}s` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1a3a52] shrink-0" />
                  {feature}
                </div>
              ))}
            </div>

            <a
              href="#demo"
              className="btn-gold inline-flex items-center gap-2.5 !px-8 !py-3.5 rounded-full text-base font-semibold tracking-wide hover:scale-105 active:scale-95 transition-transform"
            >
              <Trophy className="w-4 h-4" strokeWidth={2} /> Join Sunday Training
            </a>
          </div>

          <div className="reveal reveal-up" style={{ transitionDelay: "0.2s" }}>
            <div className="grid grid-cols-2 gap-4">
              {achievements.map((item, i) => (
                <div
                  key={item.label}
                  className="group u-card p-6 hover:border-gold/20 card-lift text-center reveal reveal-scale"
                  style={{ transitionDelay: `${0.4 + i * 0.1}s` }}
                >
                  <div className="flex justify-center mb-4">
                    <span className="icon-tile icon-tile-lg">
                      <item.Icon className="w-5 h-5" strokeWidth={1.75} />
                    </span>
                  </div>
                  <AnimatedCounter target={item.value} suffix={item.suffix} isInView={isInView} />
                  <div className="text-[0.6875rem] text-text-muted mt-2 uppercase tracking-[0.12em] font-medium">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="mt-6 p-8 rounded-2xl bg-gradient-to-br from-[#d4a843]/10 to-[#b8912e]/5 border border-[#d4a843]/25 text-center reveal reveal-up"
              style={{ transitionDelay: "0.8s" }}
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d4a843]/20 to-[#b8912e]/5 border border-[#d4a843]/35 text-[#b8912e] mb-3 animate-float-slow shadow-[0_14px_30px_-18px_rgba(184,145,46,0.5)]">
                <Trophy className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <div className="text-sm text-[#b8912e] font-semibold">Every Sunday</div>
              <div className="text-xs text-text-muted mt-1">Competitive Tournament Practice</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
